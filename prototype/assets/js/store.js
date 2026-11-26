/* feelpost prototype — local state store (localStorage) */
(function () {
  const FP = (window.FP = window.FP || {});
  const KEY = 'feelpost.prototype.v1';

  const store = {
    state: null,
    KEY: KEY,

    init: function () {
      let raw = null;
      try { raw = window.localStorage.getItem(KEY); } catch (e) { raw = null; }
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.version === 1 && parsed.projects && parsed.projects.length) {
            this.state = parsed;
          }
        } catch (e) { /* fall through */ }
      }
      if (!this.state) this.state = FP.makeSeed();
      if (!this.state.activeEnv) this.state.activeEnv = {};
      if (!this.state.dataDir) this.state.dataDir = '~/Documents/feelpost';
      if (typeof this.state.debugLogging !== 'boolean') this.state.debugLogging = false;
      this.state.projects.forEach(function (p) {
        if (!store.state.activeEnv[p.id]) {
          store.state.activeEnv[p.id] = p.envs[0] ? p.envs[0].id : null;
        }
      });
      this.save();
      return this.state;
    },

    save: function () {
      try {
        window.localStorage.setItem(KEY, JSON.stringify(this.state));
      } catch (e) {
        // 隐私模式 / file:// 限制下退化为内存态，原型不阻塞
      }
    },

    reset: function () {
      this.state = FP.makeSeed();
      this.state.activeEnv = {};
      this.state.projects.forEach(function (p) {
        store.state.activeEnv[p.id] = p.envs[0].id;
      });
      this.save();
      return this.state;
    },

    project: function (id) {
      return this.state.projects.find(function (p) { return p.id === id; }) || this.state.projects[0];
    },

    api: function (project, apiId) {
      return project.apis.find(function (a) { return a.id === apiId; });
    },

    env: function (project, envId) {
      return project.envs.find(function (e) { return e.id === envId; }) || project.envs[0];
    },

    activeEnv: function (project) {
      return this.env(project, this.state.activeEnv[project.id]) || project.envs[0];
    },

    setActiveEnv: function (project, envId) {
      this.state.activeEnv[project.id] = envId;
      this.save();
    },

    touchProject: function (project) {
      project.lastScan = FP.util.nowStr();
      project.scanCount = (project.scanCount || 0) + 1;
      this.save();
    }
  };

  FP.store = store;
})();
