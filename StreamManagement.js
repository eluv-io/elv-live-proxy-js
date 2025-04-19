/*
 * Live stream management operations


  Metadata:
    live_recording_api:
      vod_object_id

    live_recording
      status
        prev_recording_id
        prev_recording_discard_time


  */

import { ElvClient } from  '@eluvio/elv-client-js';
import HttpClient from "@eluvio/elv-client-js/src/HttpClient.js";
import fs from 'fs';


// Globals
let client;
const networkName = "main"; // "main" or "demo"
const libraryId = "ilibP5XeH1BCncUxdexqGuKbzfrAL2H";
const libraryIdVod = "ilibstJmfXipE966Xjhv4vYZGmxmC8f"; // "ilibP5XeH1BCncUxdexqGuKbzfrAL2H";
const typeVod = "iq__2kcZripMpjNGopo7upqv8Lswq4bf";
const typeLive = "iq__sR2NQQCkGhymHCwu6qHS7b4h2J9";

const Init = async ({debug}) => {

  client = await ElvClient.FromNetworkName({networkName});
  let wallet = client.GenerateWallet();
  let signer = wallet.AddAccount({
    privateKey: process.env.PRIVATE_KEY
  });
  client.SetSigner({signer});
  client.ToggleLogging(debug);

  console.log("Initialized");
}

const StreamProbeAndConfig = async ({argv}) => {

  return {"error": "this is not implemented properly yet - too complicated"};

  let probe = probeMetadata;

  let mainMeta = await client.ContentObjectMetadata({
    libraryId: libraryId,
    objectId: objectId
  });

  let userConfig = mainMeta.live_recording_config;

  // Get node URI from user config
  const parsedName = userConfig.url
    .replace("srt://", "https://");
  const hostName = new URL(parsedName).hostname;
  const streamUrl = new URL(userConfig.url);

  client.Log(`Retrieving nodes - matching: ${hostName}`);
  let nodes = await client.SpaceNodes({matchEndpoint: hostName});
  if(nodes.length < 1) {
    throw("ERROR: failed to retrieve fabric ingest node");
  }
  let endpoint = node.endpoints[0];

  client.SetNodes({fabricURIs: [endpoint]});

  // Probe the stream
  //
  // POST /q/{object_id}/rep/probe
  // {
  //   "filename": "srt://...",
  //   "listen": true
  // }
  probe = {};
  let probeUrl = await client.Rep({
    libraryId,
    objectId,
    rep: "probe"
  });

  probe = await client.utils.ResponseToJson(
    await HttpClient.Fetch(probeUrl, {
      body: JSON.stringify({
        "filename": streamUrl.href,
        "listen": true
      }),
      method: "POST"
    })
  );

  if(probe.errors) {
    throw probe.errors[0];
  }

  let fin = await client.FinalizeContentObject({
    libraryId,
    objectId,
    writeToken,
    commitMessage: "Apply live stream configuration"
  });

  console.log("FINALIZED", fin);
}

const StreamStatus = async ({libraryId, objectId}) => {

  let status = {
    libraryId,
    objectId
  };

  let mainMeta = await client.ContentObjectMetadata({
    libraryId,
    objectId,
    select: [
      "live_recording"
    ]
  });

  if (mainMeta?.live_recording?.fabric_config == undefined) {
    status.state = "unconfigured";
    return status
  }

  status.edge_write_token = mainMeta.live_recording.fabric_config.edge_write_token;
  if(!status.edge_write_token) {
    status.state = "inactive";
  }
 
  status.node_api = mainMeta.live_recording?.fabric_config?.ingress_node_api;
  if (!status.node_api) {
    console.log("ERROR: unable to retrieve ingest node API endpoint");
    status.state = "unconfigured"
    return status
  }
  client.SetNodes({fabricURIs: [status.node_api]});

  if(!status.edge_write_token) {
    return status;
  }

  let edgeMeta = await client.ContentObjectMetadata({
    libraryId,
    objectId,
    writeToken: status.edge_write_token,
    select: [
      "live_recording_api"
    ]
  });

  status.status_url = await client.FabricUrl({
    libraryId: libraryId,
    objectId: objectId,
    writeToken: status.edge_write_token,
    call: "live/status"
  });

  let statusRes = await client.utils.ResponseToJson(
    await HttpClient.Fetch(status.status_url, {
      method: "GET"
    })
  );

  if (!statusRes.handle) {
    status.state = "stopped"
  } else {

    let obj = await client.ContentObject({
      libraryId,
      objectId
    });

    status.hash = obj.hash;
    status.recording_id = status.edge_write_token;
    status.playout = {
      hls: "https://main.net955305.contentfabric.io/s/main/q/" + status.hash + "/rep/playout/default/hls-clear/playlist.m3u8"
    }
    status.state = statusRes.custom.state;
    status.quality = statusRes.custom.quality;
  }

  status.vod_object_id = edgeMeta?.live_recording_api?.vod_object_id;

  return status;
}

const StreamStartRecording = async ({libraryId, objectId, vod, vodId, vodName}) => {

  let status = await StreamStatus({libraryId, objectId});
  if (status.state != "inactive") {
    console.log("ERROR: can only start a new recording if the stream is inactive");
    return status;
  }
  if (vod && (vodName == undefined || vodId == undefined)) {
    throw("ERROR: VOD name and ID must be specified when VOD is required")
  }

  client.SetNodes({fabricURIs: [status.node_api]});

  let response = await client.EditContentObject({
    libraryId: libraryId,
    objectId: objectId
  });
  const edgeToken = response.write_token;

  /*
  * Set the metadata, including the edge token.
  */
  response = await client.EditContentObject({
    libraryId: libraryId,
    objectId: objectId
  });
  let writeToken = response.write_token;

  await client.MergeMetadata({
    libraryId: libraryId,
    objectId: objectId,
    writeToken: writeToken,
    metadata: {
      live_recording: {
        status: {
          edge_write_token: edgeToken,
          state: "active"  // indicates there is an active session (set to 'closed' when done)
        },
        fabric_config: {
          edge_write_token: edgeToken
        }
      }
    }
  });

  response = await client.FinalizeContentObject({
    libraryId: libraryId,
    objectId: objectId,
    writeToken: writeToken,
    commitMessage: "Create stream edge write token " + edgeToken
  });

  status = await StreamStart({objectId, libraryId});

  status.playout = {
    hls: "https://main.net955305.contentfabric.io/s/main/q/" + status.hash + "/rep/playout/default/hls-clear/playlist.m3u8"
  }

  // Create VOD if requested
  if (vod) {
    const now = new Date();
    const name = "VOD - " + now.toLocaleDateString('sv-SE') + " - " + vodId + " - " + vodName;
    const description = "Live Stream: " + objectId + " Recording: " + edgeToken;

    const vodObject = await client.CreateContentObject({
      libraryId: libraryIdVod,
      options: {
        type: typeVod,
        meta: {
          public: {
            asset_metadata: {
              ip_title_id: vodId
            },
            name,
            description
          }
        }
      }
    });
    await client.SetPermission({objectId: vodObject.id, writeToken: vodObject.writeToken, permission: "editable"});
    status.vod_object_id = vodObject.id;
    status.vod_write_token = vodObject.writeToken;

    await client.FinalizeContentObject({libraryId: libraryIdVod, objectId: vodObject.id, writeToken: vodObject.writeToken});

    // Store VOD object id in live_recording_api.vod_object_id
    await client.MergeMetadata({
      libraryId: libraryId,
      objectId: objectId,
      writeToken: edgeToken,
      metadata: {
        live_recording_api: {
          vod_object_id: vodObject.id
        }
      }
    });
  }

  return status;
}

const StreamStart = async ({libraryId, objectId}) => {

  let status = await StreamStatus({libraryId, objectId});
  if (status.state != "stopped") {
    console.log("ERROR: can only start a recording that is stopped");
    return status;
  }

  await client.CallBitcodeMethod({
    libraryId: libraryId,
    objectId: objectId,
    writeToken: status.edge_write_token,
    method: "/live/start",
    constant: false
  });

  status.state = "starting";
  return status;
}

const StreamStop = async ({libraryId, objectId}) => {

  let status = await StreamStatus({libraryId, objectId});
  if (status.state != "starting" && status.state != "running") {
    console.log("ERROR: can only stop a recording that is running");
    return status;
  }

  try {
    await client.CallBitcodeMethod({
      libraryId: libraryId,
      objectId: objectId,
      writeToken: status.edge_write_token,
      method: "/live/stop",
      constant: false
    });
  } catch(error) {
    // The /call/lro/stop API returns HTTP 204 and empty response
  }

  status.state = "stopping";
  return status;
}


const StreamStopRecording = async ({libraryId, objectId}) => {

  let status = await StreamStatus({libraryId, objectId});
  if (status.state != "stopped" && status.state != "starting" && status.state != "running") {
    console.log("ERROR: can only end/stop a recording that is running or stopped");
    return status;
  }

  if (status.state == "starting" || status.state == "running") {
    status = await StreamStop({libraryId, objectId});
  }

  // Set stop time and inactive state
  const stopTime = Math.floor(new Date().getTime() / 1000);
  const m = {
    live_recording: {
      status: {
        recording_stop_time: stopTime
      }
    }
  };

  await client.MergeMetadata({
    libraryId,
    objectId,
    writeToken: status.edge_write_token,
    metadata: m
  });

  return status;
}


const StreamToVod = async ({libraryId, objectId, vodObjectId, vodId, vodName}) => {

  let status = await StreamStatus({libraryId, objectId});
  if (status.state != "stopped" && status.state != "running" && status.state != "starting" && status.state != "reconnecting") {
    console.log("ERROR: can only copy an active stream");
    return status;
  }

  const description = "Live Stream " + objectId + " \nRecording " + status.recording_id;

  status.vod_library_id = libraryIdVod;

  if (vodObjectId == undefined) {
    if (status.vod_object_id != undefined) {
      vodObjectId = status.vod_object_id;
    }
  }

  if (vodObjectId == undefined) {
    if (vodName == undefined || vodId == undefined) {
      throw("ERROR: VOD name and ID are required");
    }
    console.log("VOD CREATE");
    // Create VOD object
    const now = new Date();
    const name = "VOD - " + now.toLocaleDateString('sv-SE') + " - " + vodId + " - " + vodName;

    const newObject = await client.CreateContentObject({
      libraryId: libraryIdVod,
      options: {
        type: typeVod,
        meta: {
          public: {
            asset_metadata: {
              ip_title_id: vodId
            },
            name,
            description
          }
        }
      }
    });
    await client.SetPermission({objectId: newObject.objectId, writeToken: newObject.writeToken, permission: "editable"});
    vodObjectId = newObject.id;
    status.vod_object_id = newObject.id;
    status.vod_write_token = newObject.writeToken;
  } else {

    console.log("VOD EXISTING", vodObjectId);
    // Validation - ensure target object has content encryption keys
    const kmsAddress = await client.authClient.KMSAddress({objectId: vodObjectId});
    const kmsCapId = `eluv.caps.ikms${client.utils.AddressToHash(kmsAddress)}`;
    const kmsCap = await client.ContentObjectMetadata({
      libraryId: libraryIdVod,
      objectId: vodObjectId,
      metadataSubtree: kmsCapId
    });
    if (!kmsCap) {
      throw("ERROR: VOD object has no content encryption keys");
    }

    let edt = await client.EditContentObject({
      objectId: vodObjectId,
      libraryId: libraryIdVod
    });

    status.vod_object_id = vodObjectId;
    status.vod_write_token = edt.writeToken;
  }

  console.log("VOD OBJECT", status);

  const drm = false;
  let abr;
  if (drm) {
    abr = fs.readFileSync("./abr_profile_live_to_vod_drm.json");
  } else {
    abr = fs.readFileSync("./abr_profile_live_to_vod.json");
  }
  const abrProfileLiveToVod = JSON.parse(abr);

  console.log("Process live source");

  let liveHash = await client.LatestVersionHash({objectId, libraryId});
  status.live_hash = liveHash;

  await client.CallBitcodeMethod({
    libraryId: libraryIdVod,
    objectId: vodObjectId,
    writeToken: status.vod_write_token,
    method: "/media/live_to_vod/init",
    body: {
      "live_qhash": liveHash,
      "start_time": null, // eg. "2023-10-03T02:09:02.00Z",
      "end_time": null, // eg. "2023-10-03T02:15:00.00Z",
      //"streams": ["video", "audio"],
      "recording_period": 0, // 0 = all periods, -1 = last period
      "variant_key": "default",
    },
    constant: false,
    format: "text"
  });

  console.log("Initialize VoD mezzanine");
  let abrMezInitBody = {
    abr_profile: abrProfileLiveToVod,
    "offering_key": "default",
    "prod_master_hash": status.vod_write_token,
    "variant_key": "default",
    "keep_other_streams": false,

    "additional_offering_specs": {
      "default_dash": [
        {
          "op": "replace",
          "path": "/playout/playout_formats",
          "value": {
            "dash-clear": {
              "drm": null,
              "protocol": {
                "min_buffer_length": 2,
                "type": "ProtoDash"
              }
            }
          }
        }
      ]
    }
  };

  await client.CallBitcodeMethod({
    libraryId: libraryIdVod,
    objectId: vodObjectId,
    writeToken: status.vod_write_token,
    method: "/media/abr_mezzanine/init",
    body: abrMezInitBody,
    constant: false,
    format: "text"
  });

  console.log("Populate live parts");
  await client.CallBitcodeMethod({
    libraryId: libraryIdVod,
    objectId: vodObjectId,
    writeToken: status.vod_write_token,
    method: "/media/live_to_vod/copy",
    body: {
      "variant_key": "default",
      "offering_key": "default",
    },
    constant: false,
    format: "text"
  });

  console.log("Finalize VoD mezzanine");
  await client.CallBitcodeMethod({
    libraryId: libraryIdVod,
    objectId: vodObjectId,
    writeToken: status.vod_write_token,
    method: "/media/abr_mezzanine/offerings/default/finalize",
    body: abrMezInitBody,
    constant: false,
    format: "text"
  });

  let finalize = true;
  if (finalize) {
    console.log("Finalize target object");
    let fin = await client.FinalizeContentObject({
      libraryId: libraryIdVod,
      objectId: vodObjectId,
      writeToken: status.vod_write_token,
      commitMessage: "Live Stream to VoD"
    });
    status.vod_hash = fin.hash;
  }


  console.log("VOD DONE", status);

  return status;

}

const StreamDiscardRecording = async ({libraryId, objectId}) => {

  let status = await StreamStatus({libraryId, objectId});
  if (status.state != "stopped") {
    console.log("ERROR: can only discard/deactivate a stream that is stopped");
    return status;
  }

  const {writeToken} = await client.EditContentObject({
    libraryId: libraryId,
    objectId: objectId
  });

  // Set stop time and inactive state
  const stopTime = Math.floor(new Date().getTime() / 1000);
  const m = {
    live_recording: {
      status: {
        edge_write_token: "",
        state: "inactive",
        prev_recording_id: writeToken,
        prev_recording_discard_time: stopTime
      },
      fabric_config: {
        edge_write_token: ""
      }
    }
  };

  await client.MergeMetadata({
    libraryId,
    objectId,
    writeToken,
    metadata: m
  });

  let fin = await client.FinalizeContentObject({
    libraryId,
    objectId,
    writeToken,
    commitMessage: `Deactivate live stream - stop time ${stopTime}`
  });

  status.inactive_hash = fin.hash;
  status.state = "inactive";

  return status;

}

// MAIN

let res = {};

//Init()
//res = await StreamStatus({libraryId, objectId});
//res = await StreamStartRecording({libraryId, objectId});
//res = await StreamStopRecording({libraryId, objectId});
//res = await StreamStart({libraryId, objectId});
//res = await StreamStop({libraryId, objectId});
//res = await StreamToVod({libraryId, objectId});
//res = await StreamDiscardRecording({libraryId, objectId});

console.log(res);

export default {
  Init,
  StreamStatus,
  StreamStartRecording,
  StreamStopRecording,
  StreamStart,
  StreamStop,
  StreamToVod,
  StreamDiscardRecording
}
