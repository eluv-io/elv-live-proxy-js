


## LIVE STREAM LIFE CYCLE

A live stream is a content object of type "live stream".

The main operations on the live stream are:

- Create
- Configure
- Start a recording
- May stop and start - this will create multiple recording periods in the recording
- End the recording
- Copy to VOD
- Deactivate (discard) the recording

### LIVE STREAM STATES

- unconfigured
- inactive
- starting
- running
- stalled
- stopped

### SAMPLE CODE

Assuming a stream is created and configured - this is done as part of the setup phase, before live events.

- StreamStatus({libraryId, objectId});
  - returns the status of the stream
  - the variable state indicates if `unconfigured`, `inactive`, etc.

- StreamStartRecording({libraryId, objectId})
- StreamStopRecording({libraryId, objectId})

- StreamStart({libraryId, objectId})
- StreamStop({libraryId, objectId})

- StreamDiscardRecording({libraryId, objectId})


## RUN THE SAMPLE CODE

One time setup:

```
    npm install
```

First:

```
    export PRIVATE_KEY=0x...
```

Edit `StreamManagement.js` - uncomment one function to run:


```
    //res = await StreamStatus({libraryId, objectId});
    //res = await StreamStartRecording({libraryId, objectId});
    //res = await StreamStopRecording({libraryId, objectId});
    //res = await StreamStart({libraryId, objectId});
    //res = await StreamStop({libraryId, objectId});
    //res = await StreamToVod({libraryId, objectId});
    //res = await StreamDiscardRecording({libraryId, objectId});
```

Then:

```
    node StreamManagement.js
```



