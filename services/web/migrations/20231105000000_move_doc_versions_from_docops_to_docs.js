const { ObjectId, ReadPreference } = require('mongodb-legacy')

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '1000', 10)
const MIN_ID = process.env.MIN_ID

exports.tags = ['server-ce', 'server-pro', 'saas']

exports.migrate = async ({ db, nativeDb }) => {
  const docOps = nativeDb.collection('docOps')

  const filter = {}
  if (MIN_ID) {
    filter._id = { $gte: new ObjectId(MIN_ID) }
  }
  const records = docOps
    .find(filter, { readPreference: ReadPreference.secondaryPreferred })
    .sort({ _id: 1 })

  let docsProcessed = 0
  let batch = []
  for await (const record of records) {
    const docId = record.doc_id
    const version = record.version
    batch.push({
      updateOne: {
        filter: {
          _id: docId,
          version: { $exists: false },
        },
        update: { $set: { version } },
      },
    })
    if (batch.length >= BATCH_SIZE) {
      await db.docs.bulkWrite(batch, { ordered: false })
      batch = []
    }
    docsProcessed += 1
    if (docsProcessed % 100000 === 0) {
      console.log(`${docsProcessed} docs processed - last id: ${docId}`)
    }
  }
  if (batch.length > 0) {
    await db.docs.bulkWrite(batch, { ordered: false })
  }
  console.log(`DONE - ${docsProcessed} docs processed`)
}

exports.rollback = async ({ db }) => {
  // Nothing to do on rollback. We don't want to remove versions from the docs
  // collection because they might be more current than the ones in the docOps
  // collection.
}
