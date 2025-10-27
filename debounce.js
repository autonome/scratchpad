// Debounce with maxWait - ensures execution at least once per wait interval
const debounce = (callback, wait) => {
  let timeoutId = null;
  let lastExecTime = 0;

  return (...args) => {
    const now = Date.now();
    const timeSinceLastExec = now - lastExecTime;

    window.clearTimeout(timeoutId);

    // If enough time has passed since last execution, execute immediately
    if (timeSinceLastExec >= wait) {
      lastExecTime = now;
      callback.apply(null, args);
    } else {
      // Otherwise, schedule execution for the remaining time
      timeoutId = window.setTimeout(() => {
        lastExecTime = Date.now();
        callback.apply(null, args);
      }, wait - timeSinceLastExec);
    }
  };
}

export default debounce;
