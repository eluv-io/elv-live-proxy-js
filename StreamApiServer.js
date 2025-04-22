import express from "express";

import Streams from "./StreamManagement.js";

const app = express();
app.use(express.json());

const port = 9001;

const libraryId = "ilibP5XeH1BCncUxdexqGuKbzfrAL2H";

await Streams.Init({debug: false});

app.get('/', (req, res) => {
  res.status(200).json({"message": "Eluvio Live Stream Management API - 2025"});
});

// GET /streams/:stream_id
app.get('/streams/:stream_id', async (req, res) => {
  const streamId = req.params.stream_id;

  console.log(`STATUS ${streamId}`);

  let status = await Streams.StreamStatus({libraryId, objectId: streamId});
  res.status(200).json(status);
});

// POST /streams/:stream_id/start_recording
// - vod        bool
// - vod_name   string
// - vod_id     string
app.post('/streams/:stream_id/start_recording', async (req, res) => {
  const streamId = req.params.stream_id;

  console.log(`START NEW RECORDING ${streamId}`);
  let status = await Streams.StreamStartRecording({libraryId, objectId: streamId,
    vod: req.body.vod, vodName: req.body.vod_name, vodId: req.body.vod_id});

    res.status(200).json(status);
});

// POST /streams/:stream_id/stop_recording
// - vod        bool
// - vod_name   string
// - vod_id     string
// - discard    bool
app.post('/streams/:stream_id/stop_recording', async (req, res) => {
  const streamId = req.params.stream_id;

  console.log("BODY", req.body);
  console.log(`END RECORDING ${streamId} VOD:${req.body.vod} DISCARD:${req.body.discard}`);
  let status = await Streams.StreamStopRecording({libraryId, objectId: streamId});

  if (req.body.vod) {
    console.log(`VOD ${streamId} VOD:${req.body.vod} DISCARD:${req.body.discard}`);
    status = await Streams.StreamToVod({libraryId, objectId: streamId});
  }
  if(req.body.discard) {
    console.log(`DISCARD RECORDING ${streamId} VOD:${req.body.vod} DISCARD:${req.body.discard}`);
    status = await Streams.StreamDiscardRecording({libraryId, objectId: streamId});
  }
  res.status(200).json(status);
});

// POST /streams/:stream_id/vod
// - vod_id         string - (required if VOD not already created)
// - vod_name       string - (required if VOD not already created)
// - vod_object_id  string - overwrite existing VOD object ID
app.post('/streams/:stream_id/vod', async (req, res) => {
  const streamId = req.params.stream_id;

  console.log(`VOD ${streamId}`);

  let status;
  try {
    status = await Streams.StreamToVod({libraryId, objectId: streamId,
      vodName: req.body.vod_name, vodId: req.body.vod_id, vodObjectId: req.body.vod_object_id});
  } catch(e) {
    console.log("ERROR", e, JSON.stringify(e.body,  null, 2));
  }
  res.status(200).json(status);
});

// POST /streams/:stream_id/clip
// - clip_start
// - clip_end
app.post('/streams/:stream_id/clip', async (req, res) => {
  const streamId = req.params.stream_id;

  console.log(`STREAM CLIP ${streamId}`);

  let status;
  try {

    status = await Streams.StreamToVod({libraryId, objectId: streamId});

    status = await Streams.StreamClip({vodObjectId: status.vod_object_id, vodObjectHash: status.vod_hash,
      clipStart: req.body.clip_start, clipEnd: req.body.clip_end});

    } catch(e) {
    console.log("ERROR", e, JSON.stringify(e.body,  null, 2));
  }

  res.status(200).json(status);
});

// POST /vod/:vod_id/clip
// - clip_start
// - clip_end
app.post('/vod/:vod_id/clip', async (req, res) => {
  const vodObjectId = req.params.vod_id;

  console.log(`VOD CLIP ${vodObjectId}`);

  let status;
  try {

    status = await Streams.StreamClip({vodObjectId,
      clipStart: req.body.clip_start, clipEnd: req.body.clip_end});

    } catch(e) {
    console.log("ERROR", e, JSON.stringify(e.body,  null, 2));
  }

  res.status(200).json(status);
});


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
