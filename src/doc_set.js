const { List, Map, Set } = require('immutable')
const uuid = require('./uuid')
const FreezeAPI = require('./freeze_api')

class DocSet {
  constructor () {
    this.docs = Map()
    this.handlers = Set()
  }

  get docIds () {
    return this.docs.keys()
  }

  getHistory (docId) {
    return this.docs.get(docId)
  }

  getCurrentSnapshot (docId) {
    const docs = this.getHistory(docId)
    if (docs) {
      return docs.last()
    } else {
      return null
    }
  }

  getDoc (docId) {
    const snapshot = this.getCurrentSnapshot(docId)
    if (snapshot) {
      return snapshot.get("doc")
    } else {
      return null
    }
  }

  clockIsOnCurrentSnapshot (docId, clock, timestamp) {
    const currentSnapshot = this.getCurrentSnapshot(docId)
    if (!currentSnapshot) return true
    const startClock = currentSnapshot.get("startClock")
    if (startClock == null) {
      return true
    }
    return compareClock(startClock, clock)
  }

  compareClock(clock1, clock2) {
    Object.keys(clock2).forEach((key) => {
      if (clock1[key] > clock2[key]) return false;
    })
    return true;
  }

  getClosestSnapshot (docId, clock, timestamp) {
    // Do nothing
    return
  }

  createNewSnapshot (docId, clock) {
    const oldDoc = this.getDoc(docId)
    const currentDoc = Automerge.change(
      Automerge.init(oldDoc._actorId),
      `Snapshot starting from ${clock}`,
      doc => { doc.note = oldDoc.note }
    )
    // Set the clock for the new doc
    const prevClock = currentDoc._state.getIn(['opSet', 'clock'])
    currentDoc = currentDoc._state.setIn(['opSet', 'clock'], clock)

    let newSnapshot = Map({
      "doc": currentDoc,
      "startClock": clock,
      "startTimestamp": new Date(),
    })
    docList = this.getCurrentSnapshot(docId)
    docList = docList.push(newSnapshot)
    this.docs = this.docs.set(docId, docList)
    this.handlers.forEach(handler => handler(docId, currentDoc))
  }

  setDoc (docId, doc) {
    let docList = this.getHistory(docId);
    if (docList) {
      docList = docList.setIn([docList.size, "doc"], doc)
      this.docs = this.docs.set(docId, docList)
    } else {
      let snapshot = Map({
        "doc": doc,
        "startClock": null,
        "startTimestamp": new Date(),
      })
      this.docs = this.docs.set(docId, List([snapshot]))
    }
    this.handlers.forEach(handler => handler(docId, doc))
  }

  applyChanges (docId, changes, clock, timestamp) {
    let doc;
    if (this.clockIsOnCurrentSnapshot(docId, clock, timestamp)) {
      doc = this.getDoc(docId) || FreezeAPI.init(uuid())
      doc = FreezeAPI.applyChanges(doc, changes, true)
      this.setDoc(docId, doc)
      return doc
    } else {
      if (this.getClosestSnapshot(docId, clock, timestamp)) {
        // Do nothing
      }
      // For now, reject change.
      return false
    }
  }

  registerHandler (handler) {
    this.handlers = this.handlers.add(handler)
  }

  unregisterHandler (handler) {
    this.handlers = this.handlers.remove(handler)
  }
}

module.exports = DocSet
