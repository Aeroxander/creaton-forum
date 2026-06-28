use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use hkdf::Hkdf;
use commonware_codec::{Encode, ReadExt};
use commonware_cryptography::bls12381::primitives::group::{Scalar, Share, G1};
use commonware_math::algebra::{Additive, CryptoGroup, Field, Random};
use rand_core::CryptoRngCore;
use sha2::{Digest, Sha256};
use thiserror::Error;

pub const KEM_NAMESPACE: &[u8] = b"app.creaton.forum.threshold-dh-kem.v1";
const PROOF_DST: &[u8] = b"app.creaton.forum.threshold-dh-proof.v1";
pub const CONTENT_KEY_SIZE: usize = 32;

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyCapsule {
    pub encapsulation: Vec<u8>,
    pub nonce: [u8; 12],
    pub ciphertext: Vec<u8>,
    pub key_commitment: [u8; 32],
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecapsulationShare {
    pub index: u16,
    pub value: Vec<u8>,
    pub verification_share: Vec<u8>,
    pub commitment_g: Vec<u8>,
    pub commitment_u: Vec<u8>,
    pub response: Vec<u8>,
}

#[derive(Debug, Error)]
pub enum KemError {
    #[error("invalid threshold KEM encoding")]
    InvalidEncoding,
    #[error("invalid threshold decapsulation proof")]
    InvalidProof,
    #[error("not enough distinct decapsulation shares")]
    InsufficientShares,
    #[error("key wrapping failed")]
    Wrapping,
}

/// Publisher-side encapsulation. Security depends on `r` remaining unknown; unlike the
/// retired pairing construction, the shared point cannot be derived from public inputs.
pub fn encapsulate(
    committee_public: &G1,
    content_key: &[u8; CONTENT_KEY_SIZE],
    context: &[u8],
    rng: &mut impl CryptoRngCore,
) -> Result<KeyCapsule, KemError> {
    let r = Scalar::random(&mut *rng);
    let encapsulation = G1::generator() * &r;
    let shared = committee_public.clone() * &r;
    let wrapping_key = derive_wrapping_key(&shared, context)?;
    let mut nonce = [0u8; 12];
    rand_core::RngCore::fill_bytes(rng, &mut nonce);
    let ciphertext = Aes256Gcm::new_from_slice(&wrapping_key)
        .map_err(|_| KemError::Wrapping)?
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: content_key,
                aad: context,
            },
        )
        .map_err(|_| KemError::Wrapping)?;
    Ok(KeyCapsule {
        encapsulation: encapsulation.encode().to_vec(),
        nonce,
        ciphertext,
        key_commitment: Sha256::digest(content_key).into(),
    })
}

/// Operator-side threshold DH evaluation with a Chaum-Pedersen equality proof.
pub fn partial_decapsulation(
    share: &Share,
    verification_share: &G1,
    encoded_encapsulation: &[u8],
    context: &[u8],
    rng: &mut impl CryptoRngCore,
) -> Result<DecapsulationShare, KemError> {
    let u = decode_g1(encoded_encapsulation)?;
    let value = share.private.expose(|x| u * x);
    let witness = Scalar::random(&mut *rng);
    let commitment_g = G1::generator() * &witness;
    let commitment_u = u * &witness;
    let challenge = proof_challenge(
        context,
        &u,
        verification_share,
        &value,
        &commitment_g,
        &commitment_u,
    );
    let response = share.private.expose(|x| witness.clone() + &(challenge * x));
    Ok(DecapsulationShare {
        index: u16::try_from(usize::from(share.index) + 1)
            .map_err(|_| KemError::InvalidEncoding)?,
        value: value.encode().to_vec(),
        verification_share: verification_share.encode().to_vec(),
        commitment_g: commitment_g.encode().to_vec(),
        commitment_u: commitment_u.encode().to_vec(),
        response: response.encode().to_vec(),
    })
}

pub fn verify_partial(
    encoded_encapsulation: &[u8],
    context: &[u8],
    partial: &DecapsulationShare,
) -> Result<(), KemError> {
    let u = decode_g1(encoded_encapsulation)?;
    let verification_share = decode_g1(&partial.verification_share)?;
    let value = decode_g1(&partial.value)?;
    let commitment_g = decode_g1(&partial.commitment_g)?;
    let commitment_u = decode_g1(&partial.commitment_u)?;
    let response = decode_scalar(&partial.response)?;
    let challenge = proof_challenge(
        context,
        &u,
        &verification_share,
        &value,
        &commitment_g,
        &commitment_u,
    );
    let left_g = G1::generator() * &response;
    let right_g = commitment_g + &(verification_share * &challenge);
    let left_u = u * &response;
    let right_u = commitment_u + &(value * &challenge);
    if left_g != right_g || left_u != right_u {
        return Err(KemError::InvalidProof);
    }
    Ok(())
}

pub fn decapsulate(
    capsule: &KeyCapsule,
    context: &[u8],
    partials: &[DecapsulationShare],
    threshold: usize,
) -> Result<[u8; CONTENT_KEY_SIZE], KemError> {
    use std::collections::BTreeMap;
    let mut distinct = BTreeMap::new();
    for partial in partials {
        verify_partial(&capsule.encapsulation, context, partial)?;
        distinct.entry(partial.index).or_insert(partial);
    }
    if distinct.len() < threshold {
        return Err(KemError::InsufficientShares);
    }
    let selected = distinct.into_iter().take(threshold).collect::<Vec<_>>();
    let mut shared = G1::zero();
    for (index, partial) in &selected {
        let coefficient = lagrange_at_zero(*index, selected.iter().map(|(i, _)| *i));
        shared += &(decode_g1(&partial.value)? * &coefficient);
    }
    let wrapping_key = derive_wrapping_key(&shared, context)?;
    let plaintext = Aes256Gcm::new_from_slice(&wrapping_key)
        .map_err(|_| KemError::Wrapping)?
        .decrypt(
            Nonce::from_slice(&capsule.nonce),
            Payload {
                msg: &capsule.ciphertext,
                aad: context,
            },
        )
        .map_err(|_| KemError::Wrapping)?;
    let key: [u8; CONTENT_KEY_SIZE] = plaintext.try_into().map_err(|_| KemError::Wrapping)?;
    if <[u8; 32]>::from(Sha256::digest(key)) != capsule.key_commitment {
        return Err(KemError::Wrapping);
    }
    Ok(key)
}

fn lagrange_at_zero(index: u16, indices: impl IntoIterator<Item = u16>) -> Scalar {
    let x = Scalar::from_u64(u64::from(index));
    let mut numerator = Scalar::from_u64(1);
    let mut denominator = Scalar::from_u64(1);
    for other in indices {
        if other == index {
            continue;
        }
        let y = Scalar::from_u64(u64::from(other));
        numerator *= &(-y.clone());
        denominator *= &(x.clone() - &y);
    }
    numerator * &denominator.inv()
}

fn proof_challenge(
    context: &[u8],
    u: &G1,
    verification_share: &G1,
    value: &G1,
    commitment_g: &G1,
    commitment_u: &G1,
) -> Scalar {
    let mut transcript = Vec::new();
    transcript.extend_from_slice(&(context.len() as u64).to_be_bytes());
    transcript.extend_from_slice(context);
    for point in [u, verification_share, value, commitment_g, commitment_u] {
        transcript.extend_from_slice(&point.encode());
    }
    Scalar::map(PROOF_DST, &transcript)
}

fn derive_wrapping_key(shared: &G1, context: &[u8]) -> Result<[u8; 32], KemError> {
    let hkdf = Hkdf::<Sha256>::new(Some(KEM_NAMESPACE), &shared.encode());
    let mut key = [0u8; 32];
    hkdf.expand(context, &mut key)
        .map_err(|_| KemError::Wrapping)?;
    Ok(key)
}

fn decode_g1(encoded: &[u8]) -> Result<G1, KemError> {
    let mut input = encoded;
    let value = G1::read(&mut input).map_err(|_| KemError::InvalidEncoding)?;
    if !input.is_empty() {
        return Err(KemError::InvalidEncoding);
    }
    Ok(value)
}

fn decode_scalar(encoded: &[u8]) -> Result<Scalar, KemError> {
    let mut input = encoded;
    let value = Scalar::read(&mut input).map_err(|_| KemError::InvalidEncoding)?;
    if !input.is_empty() {
        return Err(KemError::InvalidEncoding);
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use commonware_cryptography::bls12381::dkg::feldman_desmedt;
    use commonware_cryptography::bls12381::primitives::sharing::Mode;
    use commonware_cryptography::bls12381::primitives::variant::MinPk;
    use commonware_utils::NZU32;
    use num_traits::ToPrimitive;
    use rand_chacha::{rand_core::SeedableRng, ChaCha20Rng};

    struct TwoOfThree;
    impl commonware_utils::Faults for TwoOfThree {
        fn max_faults(n: impl ToPrimitive) -> u32 {
            n.to_u32().unwrap().saturating_sub(2)
        }
    }

    #[test]
    fn two_proven_threshold_dh_shares_unwrap_content_key() {
        let mut rng = ChaCha20Rng::from_seed([31; 32]);
        let (sharing, shares) =
            feldman_desmedt::deal_anonymous::<MinPk, TwoOfThree>(&mut rng, Mode::default(), NZU32!(3));
        let key = [42u8; 32];
        let context = b"at://board\nat://record\n7";
        let capsule = encapsulate(sharing.public(), &key, context, &mut rng).unwrap();
        let partials = shares
            .into_iter()
            .take(2)
            .map(|share| {
                let verification_share = sharing.partial_public(share.index).unwrap();
                partial_decapsulation(
                    &share,
                    &verification_share,
                    &capsule.encapsulation,
                    context,
                    &mut rng,
                )
                .unwrap()
            })
            .collect::<Vec<_>>();
        assert_eq!(decapsulate(&capsule, context, &partials, 2).unwrap(), key);
    }
}
