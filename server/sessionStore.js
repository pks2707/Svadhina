// A tiny express-session store backed by the same better-sqlite3 database,
// so admin logins survive server restarts without needing a second DB engine.

const session = require("express-session");
const db = require("./db");

class SqliteSessionStore extends session.Store {
  constructor() {
    super();
    this._get = db.prepare("SELECT sess, expires FROM sessions WHERE sid = ?");
    this._set = db.prepare(
      "INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires"
    );
    this._destroy = db.prepare("DELETE FROM sessions WHERE sid = ?");
    this._prune = db.prepare("DELETE FROM sessions WHERE expires < ?");
    this._prune.run(Date.now());
  }

  get(sid, cb) {
    try {
      const row = this._get.get(sid);
      if (!row) return cb(null, null);
      if (row.expires < Date.now()) {
        this._destroy.run(sid);
        return cb(null, null);
      }
      cb(null, JSON.parse(row.sess));
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sessionData, cb) {
    try {
      const maxAge = sessionData.cookie && sessionData.cookie.maxAge ? sessionData.cookie.maxAge : 86400000;
      const expires = Date.now() + maxAge;
      this._set.run(sid, JSON.stringify(sessionData), expires);
      cb && cb(null);
    } catch (err) {
      cb && cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      this._destroy.run(sid);
      cb && cb(null);
    } catch (err) {
      cb && cb(err);
    }
  }

  touch(sid, sessionData, cb) {
    this.set(sid, sessionData, cb);
  }
}

module.exports = SqliteSessionStore;
