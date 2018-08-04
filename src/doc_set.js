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
      return Map()
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

  getCurrentVersion (docId) {
    const snapshot = this.getCurrentSnapshot(docId)
    return snapshot.get("version")
  }

  clockIsOnCurrentSnapshot (docId, version) {
    const currentVersion = this.getCurrentVersion(docId)
    return currentVersion === version
  }

  createNewSnapshot (docId, currentDoc, version) {
    const oldDoc = this.getDoc(docId)
    let docList = this.getHistory(docId)
    let newSnapshot = Map({
      "doc": currentDoc,
      "version": version || this.getCurrentVersion(docId) + 1,
      "startTimestamp": new Date(),
    })
    docList = docList.push(newSnapshot)
    this.docs = this.docs.set(docId, docList)
    this.handlers.forEach(handler => handler(docId, currentDoc))
  }

  setDoc (docId, doc, version) {
    let docList = this.getHistory(docId);
    if (docList) {
      docList = docList.setIn([docList.size - 1, "doc"], doc)
      this.docs = this.docs.set(docId, docList)
    } else {
      let snapshot = Map({
        "doc": doc,
        "version": version || 0,
        "startTimestamp": new Date(),
      })
      this.docs = this.docs.set(docId, List([snapshot]))
    }
    this.handlers.forEach(handler => handler(docId, doc))
  }

  applyChanges (docId, changes, version) {
    let doc;
    if (this.clockIsOnCurrentSnapshot(docId, version) || this.getCurrentVersion(docId) === undefined || this.getCurrentVersion(docId) === null) {
      doc = this.getDoc(docId) || FreezeAPI.init(uuid(), version)
      doc = FreezeAPI.applyChanges(doc, changes, true)
      this.setDoc(docId, doc, version)
      return doc
    } else {
      if (version > this.getCurrentVersion(docId)) {
        // If changes refer to a newer version, add the latest version to the
        // DocSet.
        doc = this.getDoc(docId)
        doc = FreezeAPI.init(doc._actorId, version)
        doc = FreezeAPI.applyChanges(doc, changes, true)
        this.createNewSnapshot(docId, doc, version)
        return doc
      }
      return null
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
