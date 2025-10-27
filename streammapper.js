/*
 * StreamMapper - map events in a stream to actions
 *
 * Parameters
 * - string stream key: a topic events are published on
 * - object actions: an object where each method modifies state
 *
 * The event titles are mapped against the actions, and matches are executed.
 *
 * If no match, emits error.
 *
 * Receives events from components and maps them to actions, which are then
 * executed.
 */


// shorter keys than crypto.randomUUID()
const random = () => window.crypto.getRandomValues(new Uint32Array(1))[0];

const emit = (key, data) => {
  window.dispatchEvent(new CustomEvent(key, { detail: data }));
};

export default function(actions, listener) {

  // generate random stream key for this set of actions
  const streamKey = random();

  const eventStreamHandler = async (e) => {
    const { name, props } = e.detail;
    if (name != null) {
      await actions[name](props);
      listener?.(name, props);
    }
    else {
      console.error('StreamMapper(): No matching action for event.', e);
    }
  };

  // listen for events emitted to it
  window.addEventListener(streamKey, eventStreamHandler);

  // return emit function customized for these actions
  return (name, props) => {
    emit(streamKey, { name, props });
  };
};
