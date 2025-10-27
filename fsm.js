  function ITE(prev, next) {
    var error = Error.call(this, 'Transition from ' + prev + ' to ' + next + ' is not allowed');
    error.name = 'IllegalTransitionException';
    error.prev = prev;
    error.attempt = next;
    return error;
  }

  function FSM(config) {
    const events = {};

    // TODO: validate params, eg can't have dead end states, or need some exit func
    const fsm = {
      transitions : config.states,
      current     : config.initial,
      next        : null,
      error       : config.error,
    };
    fsm.bind = (evt, fn) => {
      events[evt] = events[evt] || [];
      events[evt] = events[evt].concat(fn);
      return fsm;
    };
    fsm.unbind = (evt, fn) => {
      if (evt in events && events[evt].indexOf(fn) > -1)
        events[evt].splice(events[evt].indexOf(fn), 1);
      return fsm;
    };
    fsm.on = fsm.bind;

    const getCbs = (key) => events[key] || [];

    fsm.go = function(next = null) {
      const prev = fsm.current;
      const params = Array.prototype.slice.call(arguments, 1);

      // Default to first next state for current, so can just call `.go()`
      // TODO: file issue
      if (next === null) {
        next = fsm.transitions[prev][0];
      }

      if (fsm.transitions[prev].indexOf(next) < 0)
        return Promise.reject(new ITE(prev, next));

      const after = getCbs('after:' + prev);
      const pre = getCbs('before:' + next);
      const on = getCbs(next);
      const post = getCbs('*');

      const beforePost = after.concat(pre, on);

      const getPrefix = (index) => {
        return (index < after.length ? [next] : index < beforePost.length ? [prev] : [prev, next]);
      };

      const stateChange = after.length + pre.length;

      return beforePost
        .concat(post, function ensureStateChange() {})
        .reduce(function(series, task, index) {
          const args = getPrefix(index).concat(params);
          return series.then(function() {
            if (index === stateChange) {
              fsm.current = next;
            }

            return task.apply(task, args);
          });
        }, Promise.resolve());
    }

    return fsm;
  }

  if (typeof define == 'function' && typeof define.amd == 'object' && define.amd) {
    define(function () { return FSM; });
  } else if (typeof module === 'object' && module.exports) {
    module.exports = FSM;
  } else if (typeof self !== 'undefined') {
    self.StateMachine = FSM;
  } else {
    root.StateMachine = FSM;
  }

export default FSM;
