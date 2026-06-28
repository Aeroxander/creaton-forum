import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  base64ToHex,
  buildAddressControlRecord,
  defaultSiweUserDomain,
  hexToAtpBytes,
  makeSiweStatement,
  normalizePdsUrl,
  normalizeSiweIdentifier,
  randomNonce,
} from './siwe'

describe('wallet SIWE helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('converts hex values to ATP bytes and back', () => {
    const bytes = hexToAtpBytes('0x1234abcd')
    expect(bytes).toEqual({ $bytes: 'EjSrzQ==' })
    expect(base64ToHex(bytes.$bytes)).toBe('0x1234abcd')
  })

  it('creates fixed-length hex nonces', () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      const bytes = array as Uint8Array
      bytes.fill(0xab)
      return array
    })

    expect(randomNonce()).toBe('abababababababababababab')
    expect(randomNonce(8)).toBe('abababab')
  })

  it('normalizes PDS URLs for wallet auth', () => {
    expect(normalizePdsUrl('')).toBe('http://localhost:2583')
    expect(normalizePdsUrl('localhost:2583')).toBe('https://localhost:2583')
    expect(normalizePdsUrl('http://localhost:2583/')).toBe('http://localhost:2583')
  })

  it('uses the dev SIWE user domain while running tests', () => {
    expect(defaultSiweUserDomain).toBe('.test')
  })

  it('uses the PDS advertised user domain for bare wallet login handles', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ availableUserDomains: ['.creaton.local'] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(normalizeSiweIdentifier('alice', 'http://localhost:2583')).resolves.toBe(
      'alice.creaton.local',
    )
  })

  it('keeps full wallet login identifiers unchanged', async () => {
    await expect(normalizeSiweIdentifier('alice.test', 'http://localhost:2583')).resolves.toBe(
      'alice.test',
    )
    await expect(normalizeSiweIdentifier('@alice.test', 'http://localhost:2583')).resolves.toBe(
      'alice.test',
    )
  })

  it('falls back to the mode default handle domain when describeServer is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'))

    await expect(normalizeSiweIdentifier('alice', 'http://localhost:2583')).resolves.toBe(
      `alice${defaultSiweUserDomain}`,
    )
  })

  it('builds the Creaton wallet-link SIWE statement', () => {
    expect(
      makeSiweStatement(
        '0x0000000000000000000000000000000000000001',
        'did:plc:example',
      ),
    ).toBe(
      'Prove control of 0x0000000000000000000000000000000000000001 to link it to did:plc:example',
    )
  })

  it('builds address control records with optional alsoOn chains', () => {
    const record = buildAddressControlRecord({
      address: '0x0000000000000000000000000000000000000001',
      did: 'did:plc:example',
      signature: '0x1234',
      chainId: 42429,
      nonce: '12345678',
      issuedAt: new Date('2026-05-28T00:00:00.000Z'),
      alsoOn: [42429, 8453],
      domain: 'reddwarf.local',
      uri: 'https://reddwarf.local',
    })

    expect(record).toMatchObject({
      $type: 'com.creaton.evm.addressControl',
      alsoOn: [8453],
      siwe: {
        domain: 'reddwarf.local',
        address: '0x0000000000000000000000000000000000000001',
        chainId: 42429,
        nonce: '12345678',
        issuedAt: '2026-05-28T00:00:00.000Z',
      },
    })
  })
})
