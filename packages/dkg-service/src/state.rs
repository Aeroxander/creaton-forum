use std::collections::HashMap;
use std::path::{Path, PathBuf};

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng, Payload},
    Aes256Gcm, Nonce,
};
use commonware_codec::{Encode, Read, ReadExt};
use commonware_cryptography::bls12381::{
    dkg::golden::{Output, PublicKey},
    primitives::{group::{G1, Share}, sharing::ModeVersion},
};
use rand_core::RngCore;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::dkg::{DkgResult, ParticipantSpec};

const NONCE_SIZE: usize = 12;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredShare {
    index: u16,
    nonce: String,
    ciphertext: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredEpoch {
    board_id: String,
    epoch: u64,
    threshold: u32,
    participants: Vec<ParticipantSpec>,
    public_output: String,
    public_key: String,
    transcript_hash: String,
    shares: HashMap<String, StoredShare>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EpochCommitment {
    pub board_id: String,
    pub epoch: u64,
    pub threshold: u32,
    pub public_key: String,
    pub commitment: String,
    pub transcript_hash: String,
}

#[derive(Clone, Debug)]
pub struct LoadedShare {
    pub index: u16,
    pub share: Share,
    pub output: Output<PublicKey>,
    pub public_key: commonware_cryptography::bls12381::primitives::group::G1,
}

#[derive(Debug, Error)]
pub enum StateError {
    #[error("state encryption key must be exactly 32 bytes of hex")]
    InvalidKey,
    #[error("failed to encrypt private share")]
    Encryption,
    #[error("failed to decrypt private share")]
    Decryption,
    #[error("invalid persisted material: {0}")]
    InvalidMaterial(String),
    #[error("failed to serialize state: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("board not found")]
    BoardNotFound,
    #[error("participant not found")]
    ParticipantNotFound,
}

pub struct DkgState {
    data_dir: PathBuf,
    cipher: Aes256Gcm,
}

impl DkgState {
    pub fn new(data_dir: impl AsRef<Path>, state_key_hex: &str) -> Result<Self, StateError> {
        let key = hex::decode(state_key_hex).map_err(|_| StateError::InvalidKey)?;
        if key.len() != 32 {
            return Err(StateError::InvalidKey);
        }
        let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| StateError::InvalidKey)?;
        let data_dir = data_dir.as_ref().to_path_buf();
        std::fs::create_dir_all(&data_dir)?;
        Ok(Self { data_dir, cipher })
    }

    pub fn save_epoch(
        &self,
        board_id: &str,
        epoch: u64,
        threshold: u32,
        participants: Vec<ParticipantSpec>,
        result: &DkgResult,
    ) -> Result<EpochCommitment, StateError> {
        let public_output = base64_url(&result.public_output_bytes);
        let public_key = base64_url(&result.public_key.encode());
        let transcript_hash = format!("0x{}", hex::encode(result.transcript_hash));

        let mut shares = HashMap::with_capacity(result.shares.len());
        for (participant_id, share) in &result.shares {
            let mut nonce = [0u8; NONCE_SIZE];
            OsRng.fill_bytes(&mut nonce);
            let share_bytes = share.encode().to_vec();
            let aad = share_aad(board_id, epoch, participant_id);
            let ciphertext = self
                .cipher
                .encrypt(
                    Nonce::from_slice(&nonce),
                    Payload {
                        msg: &share_bytes,
                        aad: &aad,
                    },
                )
                .map_err(|_| StateError::Encryption)?;
            shares.insert(
                participant_id.clone(),
                StoredShare {
                    index: u16::try_from(usize::from(share.index) + 1)
                        .map_err(|_| StateError::InvalidMaterial("share index".into()))?,
                    nonce: base64_url(&nonce),
                    ciphertext: base64_url(&ciphertext),
                },
            );
        }

        let stored = StoredEpoch {
            board_id: board_id.into(),
            epoch,
            threshold,
            participants,
            public_output: public_output.clone(),
            public_key: public_key.clone(),
            transcript_hash: transcript_hash.clone(),
            shares,
        };

        let path = self.board_path(board_id);
        std::fs::create_dir_all(path.parent().unwrap())?;
        let tmp = path.with_extension("tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(&stored)?)?;
        std::fs::rename(&tmp, &path)?;

        Ok(EpochCommitment {
            board_id: board_id.into(),
            epoch,
            threshold,
            public_key,
            commitment: public_output,
            transcript_hash,
        })
    }

    pub fn commitment(&self, board_id: &str) -> Result<Option<EpochCommitment>, StateError> {
        let Some(stored) = self.load_board(board_id)? else {
            return Ok(None);
        };
        Ok(Some(self.stored_to_commitment(&stored)))
    }

    pub fn output(&self, board_id: &str) -> Result<Option<Output<PublicKey>>, StateError> {
        let Some(stored) = self.load_board(board_id)? else {
            return Ok(None);
        };
        decode_output(&stored.public_output, stored.participants.len())
            .map(Some)
    }

    pub fn share(&self, board_id: &str, participant_id: &str) -> Result<LoadedShare, StateError> {
        let stored = self
            .load_board(board_id)?
            .ok_or(StateError::BoardNotFound)?;
        let stored_share = stored
            .shares
            .get(participant_id)
            .ok_or(StateError::ParticipantNotFound)?;
        let output = decode_output(&stored.public_output, stored.participants.len())?;
        let public_key = output.public().public().clone();
        self.decrypt_share(board_id, &stored, stored_share, participant_id, &output, &public_key)
    }

    fn decrypt_share(
        &self,
        board_id: &str,
        stored: &StoredEpoch,
        stored_share: &StoredShare,
        participant_id: &str,
        output: &Output<PublicKey>,
        public_key: &G1,
    ) -> Result<LoadedShare, StateError> {
        let nonce = decode_base64_url(&stored_share.nonce)?;
        if nonce.len() != NONCE_SIZE {
            return Err(StateError::InvalidMaterial("invalid share nonce".into()));
        }
        let ciphertext = decode_base64_url(&stored_share.ciphertext)?;
        let aad = share_aad(board_id, stored.epoch, participant_id);
        let plaintext = self
            .cipher
            .decrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: &ciphertext,
                    aad: &aad,
                },
            )
            .map_err(|_| StateError::Decryption)?;

        let mut share_bytes = plaintext.as_slice();
        let share = Share::read(&mut share_bytes)
            .map_err(|error| StateError::InvalidMaterial(error.to_string()))?;
        if !share_bytes.is_empty() {
            return Err(StateError::InvalidMaterial("trailing share bytes".into()));
        }

        Ok(LoadedShare {
            index: stored_share.index,
            share,
            output: output.clone(),
            public_key: public_key.clone(),
        })
    }

    pub fn all_shares(
        &self,
        board_id: &str,
    ) -> Result<Option<(u32, Vec<LoadedShare>)>, StateError> {
        let Some(stored) = self.load_board(board_id)? else {
            return Ok(None);
        };
        let output = decode_output(&stored.public_output, stored.participants.len())?;
        let public_key = output.public().public().clone();
        let mut shares = Vec::with_capacity(stored.shares.len());
        for (participant_id, stored_share) in &stored.shares {
            let loaded = self.decrypt_share(board_id, &stored, stored_share, participant_id, &output, &public_key)?;
            shares.push(loaded);
        }
        Ok(Some((stored.threshold, shares)))
    }

    pub fn exists(&self, board_id: &str) -> bool {
        self.board_path(board_id).exists()
    }

    fn load_board(&self, board_id: &str) -> Result<Option<StoredEpoch>, StateError> {
        let path = self.board_path(board_id);
        if !path.exists() {
            return Ok(None);
        }
        let bytes = std::fs::read(&path)?;
        let stored: StoredEpoch = serde_json::from_slice(&bytes)?;
        Ok(Some(stored))
    }

    fn stored_to_commitment(&self, stored: &StoredEpoch) -> EpochCommitment {
        EpochCommitment {
            board_id: stored.board_id.clone(),
            epoch: stored.epoch,
            threshold: stored.threshold,
            public_key: stored.public_key.clone(),
            commitment: stored.public_output.clone(),
            transcript_hash: stored.transcript_hash.clone(),
        }
    }

    fn board_path(&self, board_id: &str) -> PathBuf {
        self.data_dir.join(format!("boards/{board_id}.json"))
    }
}

fn decode_output(public_output: &str, participant_count: usize) -> Result<Output<PublicKey>, StateError> {
    let public_output = decode_base64_url(public_output)?;
    let mut output_bytes = public_output.as_slice();
    let max_players =
        std::num::NonZeroU32::new(participant_count.max(1) as u32).unwrap();
    let output = Output::<PublicKey>::read_cfg(&mut output_bytes, &(max_players, ModeVersion::v0()))
        .map_err(|error| StateError::InvalidMaterial(error.to_string()))?;
    if !output_bytes.is_empty() {
        return Err(StateError::InvalidMaterial("trailing output bytes".into()));
    }
    Ok(output)
}

fn share_aad(board_id: &str, epoch: u64, participant_id: &str) -> Vec<u8> {
    format!(
        "app.creaton.forum.dkg-service.share.v1:{}:{}:{}",
        board_id, epoch, participant_id
    )
    .into_bytes()
}

fn base64_url(bytes: &[u8]) -> String {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    URL_SAFE_NO_PAD.encode(bytes)
}

fn decode_base64_url(value: &str) -> Result<Vec<u8>, StateError> {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    URL_SAFE_NO_PAD
        .decode(value)
        .map_err(|error| StateError::InvalidMaterial(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dkg::{GoldenSetup, ParticipantSpec};
    use rand_chacha::{rand_core::SeedableRng, ChaCha20Rng};

    #[test]
    fn round_trip_encrypts_share() {
        let tmp = tempfile::tempdir().unwrap();
        let mut rng = ChaCha20Rng::from_seed([7u8; 32]);
        let setup = GoldenSetup::generate(std::num::NonZeroU32::new(3).unwrap());
        let participants = vec![
            ParticipantSpec {
                id: "a".into(),
                public_key: "pk".into(),
            },
            ParticipantSpec {
                id: "b".into(),
                public_key: "pk".into(),
            },
        ];
        let result = crate::dkg::run_dkg(&setup, 1, &participants, 2, None, &mut rng).unwrap();
        let state = DkgState::new(tmp.path(), &hex::encode([9u8; 32])).unwrap();
        let commitment = state
            .save_epoch("board1", 1, 2, participants.clone(), &result)
            .unwrap();
        assert_eq!(commitment.board_id, "board1");
        assert_eq!(commitment.epoch, 1);

        let loaded = state.share("board1", "a").unwrap();
        assert_eq!(loaded.output.encode().to_vec(), result.public_output_bytes);

        // Private share bytes must not appear in the persisted file.
        let file = std::fs::read_to_string(state.board_path("board1")).unwrap();
        for (_, share) in result.shares {
            assert!(!file.contains(&base64::encode(share.encode().to_vec())));
        }
    }
}
