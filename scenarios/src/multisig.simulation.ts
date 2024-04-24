/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils, Transaction } from '@ironfish/sdk'
import { Cluster } from 'fishtank'
import { mineUntilTransactionConfirmed, sendIronTo, withTestCluster } from '.'

const PARTICIPANTS = [
  // TODO accountName to `account-1` once that bug fix is released...
  { nodeName: 'node-1', participantName: 'participant-1', accountName: 'participant-1' },
  { nodeName: 'node-2', participantName: 'participant-2', accountName: 'participant-2' },
  { nodeName: 'node-3', participantName: 'participant-3', accountName: 'participant-3' },
  { nodeName: 'node-4', participantName: 'participant-4', accountName: 'participant-4' },
  { nodeName: 'node-5', participantName: 'participant-5', accountName: 'participant-5' },
]

const THRESHOLD = 3

const randomInRange = (start: number, end: number): number => {
  return start + Math.floor(Math.random() * (end - start))
}

const pickOne = <T>(elems: Array<T>): T => {
  const index = randomInRange(0, elems.length)
  return elems[index]
}

const pickN = <T>(elems: Array<T>, n: number): Array<T> => {
  return elems
    .map((elem) => ({ elem, order: Math.random() }))
    .sort((left, right) => left.order - right.order)
    .map(({ elem }) => elem)
    .slice(0, n)
}

describe('multi-signature wallets', () => {
  it('can be created with trusted dealer key generation', async () => {
    return withTestCluster(async (cluster: Cluster) => {
      await cluster.init()

      // Spawn a dedicated node for each participant, and create identities
      const participants = await Promise.all(
        PARTICIPANTS.map(async (participant) => {
          const node = await cluster.spawn({ name: participant.nodeName })
          const rpc = await node.connectRpc()
          const identity = (
            await rpc.wallet.multisig.createParticipant({ name: participant.participantName })
          ).content.identity
          return { ...participant, node, rpc, identity }
        }),
      )

      // Spawn a node for the trusted dealer, and create the trusted dealer
      // package
      const dealerNode = await cluster.spawn({ name: 'dealer' })
      const dealerRpc = await dealerNode.connectRpc()
      const { participantAccounts, publicAddress } = (
        await dealerRpc.wallet.multisig.createTrustedDealerKeyPackage({
          minSigners: THRESHOLD,
          participants: participants.map(({ identity }) => ({ identity })),
        })
      ).content
      await dealerNode.remove()

      // Import the accounts generated by the trusted dealer
      await Promise.all(
        participants.map(async ({ accountName, rpc, identity }) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const account = participantAccounts.find(
            (entry) => entry.identity === identity,
          )!.account
          await rpc.wallet.importAccount({ account, name: accountName })
          await rpc.wallet.useAccount({ account: accountName })
        }),
      )

      // Send some $IRON to the multisig group to ensure it can correctly
      // receive transactions
      await sendIronTo({ cluster, publicAddress, amount: 200_000_000n })
      await cluster.waitForConvergence()

      const balances = await Promise.all(
        participants.map(async ({ rpc }) => {
          return BigInt((await rpc.wallet.getAccountBalance()).content.available)
        }),
      )
      for (const balance of balances) {
        expect(balance).toBe(200_000_000n)
      }

      // Send a transaction from the multisig group: first spawn a node with an
      // account that will receive the transaction
      const recipientNode = await cluster.spawn({ name: 'recipient' })
      const recipientRpc = await recipientNode.connectRpc()
      const recipientPublicAddress = (await recipientRpc.wallet.getAccountPublicKey()).content
        .publicKey

      // Create the unsigned transaction
      const rawTransaction = (
        await participants[0].rpc.wallet.createTransaction({
          account: participants[0].accountName,
          outputs: [
            {
              publicAddress: recipientPublicAddress,
              amount: CurrencyUtils.encode(100_000_000n),
            },
          ],
          fee: CurrencyUtils.encode(500n),
        })
      ).content.transaction

      const unsignedTransaction = (
        await participants[0].rpc.wallet.buildTransaction({ rawTransaction })
      ).content.unsignedTransaction

      // Sign the transaction
      const numSigners = randomInRange(THRESHOLD, participants.length)
      const signers = pickN(participants, numSigners)

      const commitments = await Promise.all(
        signers.map(async ({ rpc }) => {
          return (
            await rpc.wallet.multisig.createSigningCommitment({
              unsignedTransaction,
              signers: signers.map(({ identity }) => ({ identity })),
            })
          ).content.commitment
        }),
      )

      const signingPackage = (
        await pickOne(participants).rpc.wallet.multisig.createSigningPackage({
          unsignedTransaction,
          commitments,
        })
      ).content.signingPackage

      const signatureShares = await Promise.all(
        signers.map(async ({ rpc }) => {
          return (await rpc.wallet.multisig.createSignatureShare({ signingPackage })).content
            .signatureShare
        }),
      )

      // Submit the transaction
      const { transaction, accepted, broadcasted } = (
        await pickOne(participants).rpc.wallet.multisig.aggregateSignatureShares({
          signingPackage,
          signatureShares,
          broadcast: true,
        })
      ).content
      expect(accepted).toBe(true)
      expect(broadcasted).toBe(true)

      // Ensure the transaction has been received by the recipient
      const transactionHash = new Transaction(new Buffer(transaction, 'hex'))
        .hash()
        .toString('hex')
      await mineUntilTransactionConfirmed({ cluster, transactionHash })
      await cluster.waitForConvergence()

      const receivedAmount = BigInt(
        (await recipientRpc.wallet.getAccountBalance()).content.available,
      )
      expect(receivedAmount).toBe(100_000_000n)
    })
  })
})
