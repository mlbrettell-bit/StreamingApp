/*
 * Copyright 2022 - 2025 Amazon.com, Inc. or its affiliates. All rights reserved.
 *
 * AMAZON PROPRIETARY/CONFIDENTIAL
 *
 * You may not use this file except in compliance with the terms and
 * conditions set forth in the accompanying LICENSE.TXT file.
 *
 * THESE MATERIALS ARE PROVIDED ON AN "AS IS" BASIS. AMAZON SPECIFICALLY
 * DISCLAIMS, WITH RESPECT TO THESE MATERIALS, ALL WARRANTIES, EXPRESS,
 * IMPLIED, OR STATUTORY, INCLUDING THE IMPLIED WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
 */


// @ts-nocheck
import {Platform} from 'react-native';
import {PlayerInterface} from "../PlayerInterface";
import {PlayerBase} from "../PlayerBase";
import shaka from "./dist/shaka-player.compiled.debug";
import {HTMLMediaElement} from "@amazon-devices/react-native-w3cmedia";

// import polyfills
import Document from "../polyfills/DocumentPolyfill";
import Element from "../polyfills/ElementPolyfill";
import TextDecoderPolyfill from "../polyfills/TextDecoderPolyfill";
import W3CMediaPolyfill from "../polyfills/W3CMediaPolyfill";
import MiscPolyfill from "../polyfills/MiscPolyfill";

// install polyfills
Document.install();
Element.install();
TextDecoderPolyfill.install();
W3CMediaPolyfill.install();
MiscPolyfill.install();


const playerName: string = "shaka";
const playerVersion: string = "4.8.5";

export interface ShakaPlayerSettings {
    secure: boolean,
    abrEnabled: boolean,
    abrMaxWidth?: number,
    abrMaxHeight?: number,
    startPosition?: number,
}

export class ShakaPlayer extends PlayerBase {
    player :shaka.Player;
    private setting_: ShakaPlayerSettings;
    private loadOOBSubtitlesShaka_: boolean;
    constructor(mediaElement: HTMLMediaElement | null, setting: ShakaPlayerSettings) {
        super(mediaElement);
        this.setting_ = setting;
        this.loadOOBSubtitlesShaka_ = false;
        console.log(`created shaka with ${shaka.Player.version} version`);
    }

    // Custom callbacks {{{
    // This whole section is a port from shakaplayer demo app
    /**
     * A prefix retrieved in a manifest response filter and used in a subsequent
     * license request filter.  Necessary for VDMS content.
     *
     * @type {string}
     */
    private lastUplynkPrefix : string = '';

    /**
     * A response filter for VDMS Uplynk manifest responses.
     * This allows us to get the license prefix that is necessary
     * to later generate a proper license response.
     *
     * @param {shaka.net.NetworkingEngine.RequestType} type
     * @param {shaka.extern.Response} response
     */
    uplynkResponseFilter(type : shaka.net.NetworkingEngine.RequestType , response : shaka.extern.Response) : void {
      if (type == shaka.net.NetworkingEngine.RequestType.MANIFEST) {
        // Parse a custom header that contains a value needed to build a proper
        // license server URL.
        if (response.headers['x-uplynk-prefix']) {
          this.lastUplynkPrefix = response.headers['x-uplynk-prefix'];
          console.log(`shakaplayer in the response filter update Prefix to ${this.lastUplynkPrefix}`);
        } else {
          this.lastUplynkPrefix = '';
        }
      }
    }

    /**
     * A license request filter for VDMS Uplynk license requests.
     *
     * @param {shaka.net.NetworkingEngine.RequestType} type
     * @param {shaka.extern.Request} request
     */
    uplynkRequestFilter(type : shaka.net.NetworkingEngine.RequestType, request : shaka.extern.Request) : void {
      if (type == shaka.net.NetworkingEngine.RequestType.LICENSE) {
        console.log('W3cMediaApp::shakaplayer: in the request filter LICENSE');
        // Modify the license request URL based on our cookie.
        if (request.uris[0].includes('wv') && this.lastUplynkPrefix) {
          console.log(`shakaplayer in the request filter LICENSE WV`);
          request.uris[0] = this.lastUplynkPrefix.concat('/wv');
        } else if (request.uris[0].includes('ck') && this.lastUplynkPrefix) {
          request.uris[0] = this.lastUplynkPrefix.concat('/ck');
        } else if (request.uris[0].includes('pr') && this.lastUplynkPrefix) {
          console.log(`shakaplayer in the request filter LICENSE PR`);
          request.uris[0] = this.lastUplynkPrefix.concat('/pr');
        }
      }
    }

   /**
   * @param {!Map.<string, string>} headers
   * @param {shaka.net.NetworkingEngine.RequestType} requestType
   * @param {shaka.extern.Request} request
   * @private
   */
  addLicenseRequestHeaders_(headers : Map<string, string>, requestType : shaka.net.NetworkingEngine.RequestType, request : shaka.extern.Request) {
    if (requestType != shaka.net.NetworkingEngine.RequestType.LICENSE) {
      return;
    }

    // Add these to the existing headers.  Do not clobber them!
    // For PlayReady, there will already be headers in the request.
    headers.forEach((value, key) => {
      request.headers[key] = value;
    });
  }

   /**
   * @param {!Map.<string, string>} headers
   * @param {shaka.net.NetworkingEngine.RequestType} requestType
   * @param {shaka.extern.Request} request
   * @private
   */
  addManifestRequestHeaders_(headers : Map<string, string>, requestType : shaka.net.NetworkingEngine.RequestType, request : shaka.extern.Request) {
    if (requestType === shaka.net.NetworkingEngine.RequestType.MANIFEST ||
        requestType === shaka.net.NetworkingEngine.RequestType.SEGMENT) {

      // Add these to the existing headers.  Do not clobber them!
      headers.forEach((value, key) => {
        request.headers[key] = value;
      });
    }
  }

  /*
   * Function to override manifest PSSH value.
   */
  initDataTransform (initData : ArrayBuffer | ArrayBufferView , initDataType : ArrayBuffer | ArrayBufferView | string , drmInfo?: shaka.extern.DrmInfo ) : Uint8Array {
    if (drmInfo?.keySystem.includes("playready") && drmInfo?.licenseServerUri.includes("uplynk")) {
        console.log(`Playready uplynk. need to manipulate PSSH`);
        let newInitData = new Uint8Array(initData.byteLength + 10);
        newInitData.set([0x00, 0x00, 0x05, initData[3] + 10, 0x70, 0x73, 0x73, 0x68, 0x00, 0x00, 0x00, 0x00, 0x9a,
                        0x04, 0xf0, 0x79, 0x98, 0x40, 0x42, 0x86, 0xab, 0x92, 0xe6, 0x5b, 0xe0, 0x88, 0x5f, 0x95,
                        0x00, 0x00, 0x05, initData[31] + 10, initData[31] + 10, 0x05, 0x00, 0x00, 0x01, 0x00, 0x01,
                        0x00, initData[31], 0x05], 0);
        newInitData.set(initData.subarray(32), 42);
        return newInitData;
    }
    return initData as Uint8Array;
  }
  async nativeParsePlaylist( manifest: ArrayBuffer, absoluteuri:string)
      : Array<shaka.hls.Playlist> {
    console.log('shaka: nativeParsePlaylist+');
    const playlist = await global.parseHlsManifest(
      playerName, playerVersion, absoluteuri, manifest, shaka);
    console.log('shaka: nativeParsePlaylist-');
    return playlist;
  }

  nativeCreateSegments(manifestUrl: string,
    firstStartTime: number,
    mediaSequenceNumber: number,
    position:  number,
    discontinuitySequence: number,
    mediaSequenceToStartTimeJs: Map<number, number>,
    ignoreManifestProgramDateTime: boolean,
    minSequenceNumber: number,
    skippedSegments: number,
    type: string,
    variables: Map<string, string>,
    retryParam: shaka.extern.RetryParameters,
    parser: shaka.hls.HlsParser)
       :Array<shaka.media.SegmentReference> {
    console.log('shaka: nativeCreateSegments+');
    let references = global.nativeShakaHlsCreateSegments(manifestUrl,
          firstStartTime,
          mediaSequenceNumber,
          position,
          discontinuitySequence,
          mediaSequenceToStartTimeJs,
          ignoreManifestProgramDateTime,
          minSequenceNumber,
          skippedSegments,
          type,
          variables,
          retryParam,
          shaka,
          parser
        );
      console.log('shaka: nativeCreateSegments-');
      return references;
    }

  // Function to listen player state Events.
  registerStatesEvents(listener?: any) {
    if (!this.player) {
      console.info(`W3cMediaApp::shakaplayer: Not initialized`);
      return;
    }

    this.player.addEventListener("statechanged", (event) => {
      console.debug('W3cMediaApp::shakaplayer:state changed -> ' + event?.newstate);
      listener?.();
    });

    this.player.addEventListener("onstatechange", (event) => {
      console.debug('W3cMediaApp::shakaplayer:load state changed -> ' + event?.state);
      listener?.();
    });
  }

  // Function to listen network related Events.
  registerNetworkEvents(listener?: any) {
    if (!this.player) {
      console.info('W3cMediaApp::shakaplayer: Not initialized');
      return;
    }     
          
    this.player.addEventListener("downloadcompleted", (event) => {
      // Commenting to avoid log flood.
      // TODO Need to enable Logging levels and enable log.
      // console.debug('W3cMediaApp::shakaplayer:Download completed -> ' + event?.request.uris);
           
      listener?.();
    });     
            
    // https://shaka-player-demo.appspot.com/docs/api/shaka.Player.html#.event:DownloadFailed
    this.player.addEventListener("downloadfailed", (event) => {
      let request = event?.request;
      let error = event?.error;
      let responsecode = event?.httpResponseCode;
      let aborted = event?.aborted;
      console.warn('W3cMediaApp::shakaplayer:URL download failed,'
        + 'request->' + request?.uris + ','
        + 'error->' + error?.message + ','
        + 'responsecode->' + responsecode + ','
        + 'aborted->' + aborted);
      listener?.();
    });

    this.player.addEventListener("downloadheadersreceived", (event) => {
      // Commenting to avoid log flood.
      // TODO Need to enable Logging levels and enable log.
      // console.debug('W3cMediaApp::shakaplayer:Headers Received -> ' + event?.request.uris);
      
      listener?.();
    });     
  }

  // Function to listen events occur during playback.
  registerPlaybackEvents(listener?: any) {
    if (!this.player) {
      console.info('W3cMediaApp::shakaplayer: Not initialized');
      return;
    }

    // https://shaka-player-demo.appspot.com/docs/api/shaka.Player.html#.event:LoadingEvent
    this.player.addEventListener("loading", (event) => {
      console.debug('W3cMediaApp::shakaplayer: player is loading');
      listener?.();
    });

    // https://shaka-player-demo.appspot.com/docs/api/shaka.Player.html#.event:LoadedEvent
    this.player.addEventListener("loaded", (event) => {
      console.debug('W3cMediaApp::shakaplayer: player is loaded');
      listener?.();
    });

    // https://shaka-player-demo.appspot.com/docs/api/shaka.Player.html#.event:ManifestParsedEvent
    this.player.addEventListener("manifestparsed", (event) => {
      console.debug('W3cMediaApp::shakaplayer: Manifest is parsed');
      listener?.();
    });

    // https://shaka-player-demo.appspot.com/docs/api/shaka.Player.html#.event:ManifestUpdatedEvent
    this.player.addEventListener("manifestupdated", (event) => {
      console.debug('W3cMediaApp::shakaplayer: Live Manifest is updated');
      listener?.();
    });

    // https://shaka-player-demo.appspot.com/docs/api/shaka.Player.html#.event:SegmentAppended
    this.player.addEventListener("segmentappended", (event) => {
      // Commenting to avoid log flood.
      // TODO Need to enable Logging levels and enable log.
      // console.debug("W3cMediaApp::shakaplayer:" + event?.contentType + " segment is appended with startTime="
      //  + event?.start + ", endTime=" + event?.end);
      listener?.();
    });

    // https://shaka-player-demo.appspot.com/docs/api/shaka.Player.html#.event:StallDetectedEvent
    this.player.addEventListener("stalldetected", (event) => {
      console.debug("W3cMediaApp::shakaplayer: Stall is detected");
      listener?.();
    });

    // https://shaka-player-demo.appspot.com/docs/api/shaka.Player.html#.event:DrmSessionUpdateEvent
    this.player.addEventListener("drmsessionupdate", (event) => {
      console.debug('W3cMediaApp::shakaplayer:License response is received and CDM is updated');
      listener?.();
    });

    // https://shaka-player-demo.appspot.com/docs/api/shaka.Player.html#.event:UnloadingEvent
    this.player.addEventListener("unloading", (event) => {
      console.debug('W3cMediaApp::shakaplayer:player is unloading');
      listener?.();
    });
  }

  /* Function to listen TimedMetadata Events.
   */
  registerTimedMetadataEvent(listener: any) {
    if (!this.player) {
      console.info(`W3cMediaApp::shakaplayer: Not initialized`);
      return;
    }

    const createMetadataTrack = (start: number, end: number, text: string, type: string) : void => {
      console.debug("W3cMediaApp::shakaplayer:Create Metadata text track");
      if (this.mediaElement) {
        const metadataTrack = this.mediaElement.addTextTrack('metadata', type);

        const cue : VTTCue = new VTTCue(start, end, text);
        metadataTrack.addCue(cue);
        cue.addEventListener('enter', (event: Event) => {
          const text: string = (event.target as VTTCue).text;
          const playbackTime: number = this.mediaElement.currentTime;
          console.info(`W3cMediaApp::shakaplayer:Metadata ${text} is Active and playback time is ${playbackTime}`);
          if (listener)
            listener(text, (event.target as VTTCue).id, true);
        });

        cue.addEventListener('exit', (event: Event) => {
          const text = (event.target as VTTCue).text;
          const playbackTime: number = this.mediaElement.currentTime;
          console.info(`W3cMediaApp::shakaplayer:Metadata ${text} is In-Active and playback time is ${playbackTime}`);
          if (listener)
            listener(text, (event.target as VTTCue).id, false);
        });
      }
    }

    // https://shaka-player-demo.appspot.com/docs/api/shaka.Player.html#.event:MetadataEvent
    this.player.addEventListener("metadata", (event) : void => {
      const startTime: number = event?.startTime;
      const endTime: number = event?.endTime;
      const metadataType: string = event?.metadataType;
      const payload: shaka.extern.MetadataFrame = event?.payload;
      const text: string = metadataType + "_" + startTime + "-" + endTime;

      console.info(`W3cMediaApp::shakaplayer:Found ${metadataType} in-band Metadata,`
        + 'startTime->' + startTime + ','
        + 'endTime->' + endTime + ','
        + 'metadataType->' + metadataType + ','
        + 'payload->' + JSON.stringify(payload));

      createMetadataTrack(startTime, endTime, text, metadataType);
    });

    // https://shaka-player-demo.appspot.com/docs/api/shaka.Player.html#.event:EmsgEvent
    this.player.addEventListener("emsg", (event) : void => {
      let emsg = event?.detail;
      if (emsg) {
        console.info('W3cMediaApp::shakaplayer: Found Emsg in-band Metadata->' + JSON.stringify(emsg));
        const startTime: number = emsg.startTime;
        const endTime: number = emsg.endTime;
        const id: number = emsg.id;
        const text: string = "Emsg_" + id + "_" + startTime + "-" + endTime;

        createMetadataTrack(startTime, endTime, text, 'emsg');
      }
    });

    // https://shaka-player-demo.appspot.com/docs/api/shaka.Player.html#.event:TimelineRegionAddedEvent
    this.player.addEventListener("timelineregionadded", (event) : void => {
      let data: shaka.extern.TimelineRegionInfo = event?.detail;
      if (data) {
        const startTime: number = data.startTime;
        const endTime: number = data.endTime;
        const id: number = data.id;
        const text: string = "EventStream_" + id + "_" + startTime + "-" + endTime;

        console.info('W3cMediaApp::shakaplayer:Found EventStream Event out-band Metadata,'
          + 'startTime->' + startTime + ','
          + 'endTime->' + endTime + ','
          + 'id->' + id + ','
          + 'node->' + JSON.stringify(data.eventNode));

        /* FYI, another way to listen on enter & exit of EventStream Event is by
         * listening to timelineregionenter & timelineregionexit shaka events
         */
        createMetadataTrack(startTime, endTime, text, 'eventstream');
      }
    });
  }

  shakaError(error:shaka.util.Error | any) {
    if (error) {
      if (error instanceof shaka.util.Error) {
        console.error("W3cMediaApp::shakaplayer: Shaka Error " + error.message);
      } else {
        console.error("W3cMediaApp::shakaplayer: Non-Shaka Error -" + error.message);
      }

      if (error.stack) {
        const stackFrames = error.stack.split('\n');
        console.info("W3cMediaApp::shakaplayer:Exception Stack Trace:");
        stackFrames.forEach(frame => {
          console.log(frame.trim()); // Trim to remove potential leading/trailing whitespace
        });
      }
    }
    throw error;
  }

  private registerNativeParser(): void {
    if (global.registerNativePlayerUtils && shaka.hls.HlsParser.setNativeFunctions) {
      console.log("W3cMediaApp::shakaplayer: registerNativePlayerUtils found");
      console.log(`W3cMediaApp::shakaplayer: checking native support for player: ${playerName}, version: ${playerVersion}`);
      if (!global.isNativeHlsParserSupported) {
        const ret = global.registerNativePlayerUtils();
        console.log("shaka: native functions registered: " + ret);
      }
      if (global.isNativeHlsParserSupported && global.parseHlsManifest &&
        global.nativeShakaHlsCreateSegments) {
        const nativeHlsParserSupported = global.isNativeHlsParserSupported(playerName, playerVersion);
        if (nativeHlsParserSupported) {
          console.log('shaka: setting native functions');
          shaka.hls.HlsParser.setNativeFunctions(this.nativeParsePlaylist);
        } else {
          console.log('shaka: nativeHlsParser not supported for player version');
        }
      } else {
        console.log('shaka: native func not set even after register, skipping it');
      }
    } else {
      console.log(`W3cMediaApp::shakaplayer: native offload not enabled! 
                registerNativePlayerUtils: ${!!global.registerNativePlayerUtils}, 
                setNativeFunctions: ${!!shaka.hls.HlsParser.setNativeFunctions}`);
    }
  }
    // End custom callbacks }}}

    override async load(content: any, autoplay: boolean): void {
        if (!content.disableNativization) {
          this.registerNativeParser();
          console.log('Nativization Enabled');
        } else {
          console.log('Nativization Disabled');
        }
        shaka.polyfill.installAll();
        console.log("W3cMediaApp::shakaplayer: unregistering scheme http and https");
        shaka.net.NetworkingEngine.unregisterScheme('http');
        shaka.net.NetworkingEngine.unregisterScheme('https');
        shaka.media.ClosedCaptionParser.unregisterParser('video/mp4');
        shaka.media.ClosedCaptionParser.unregisterParser('video/mp2t');

        console.log("W3cMediaApp::shakaplayer: registering scheme http and https");
        const httpFetchPluginSupported = shaka.net.HttpFetchPlugin.isSupported();
        console.log(`httpfetchplugin supported? ${httpFetchPluginSupported}`);

        shaka.net.NetworkingEngine.registerScheme(
            'http', shaka.net.HttpFetchPlugin.parse,
            shaka.net.NetworkingEngine.PluginPriority.APPLICATION,
            true);

        shaka.net.NetworkingEngine.registerScheme(
            'https', shaka.net.HttpFetchPlugin.parse,
            shaka.net.NetworkingEngine.PluginPriority.APPLICATION,
            true);
      
        if (!this.player) {
            this.player = new shaka.Player(this.mediaElement);
            console.log("W3cMediaApp::shakaplayer: creating New Shaka Instance");
        } else {
            console.log("W3cMediaApp::shakaplayer: Reusing existing Shaka Instance");
            await this.player.attach(this.mediaElement);
        }

        this.player.resetConfiguration();
        
        // Registering the Custom filters for uplynk test streams.
        const netEngine = this.player.getNetworkingEngine();
        netEngine.clearAllRequestFilters();
        netEngine.clearAllResponseFilters();
        netEngine.registerRequestFilter(this.uplynkRequestFilter);
        netEngine.registerResponseFilter(this.uplynkResponseFilter);

        // This filter is needed for Axinom streams.
        if (content.hasOwnProperty('drm_license_header')) {
          let header_map : Map<string, string> = new Map();

          content.drm_license_header.map((values) => {
             console.log(`shakaplayer got License header TAG: ${values[0]} DATA: ${values[1]}`);
             header_map.set(values[0] as string, values[1] as string);
          });

          const filter = (type : shaka.net.NetworkingEngine.RequestType, request : shaka.extern.Request) :void => {
            return this.addLicenseRequestHeaders_(header_map, type, request);
          };
          netEngine.registerRequestFilter(filter);
        }

        if (content.hasOwnProperty('manifest_header')) {
          let header_map : Map<string, string> = new Map();

          content.manifest_header.map((values) => {
             console.log(`shakaplayer got Manifest header TAG: ${values[0]} DATA: ${values[1]}`);
             header_map.set(values[0] as string, values[1] as string);
          });

          const filter = (type : shaka.net.NetworkingEngine.RequestType, request : shaka.extern.Request) :void => {
            return this.addManifestRequestHeaders_(header_map, type, request);
          };
          netEngine.registerRequestFilter(filter);
        }

        const request = (type : shaka.net.NetworkingEngine.RequestType, request : shaka.extern.Request) :void => {
            console.info('W3cMediaApp::shakaplayer:Http Type:' + type + ' Request URI=' + request.uris);
            // console.debug('W3cMediaApp::shakaplayer:Request ' + JSON.stringify(request, null, 4));
         }
         netEngine.registerRequestFilter(request);
  
         const response = (type : shaka.net.NetworkingEngine.RequestType, response : shaka.extern.Response) :void => {
            console.info('W3cMediaApp::shakaplayer:Http Type:' + type + ' Response URI=' + response.uri);
            // console.debug('W3cMediaApp::shakaplayer:Response =' + JSON.stringify(response, null, 4));
         }
         netEngine.registerResponseFilter(response);

        // Need capabilities query support on native side about max
        // resolution supported by native side and dynamically
        // populate 'Max resolution' setting for ABR.
        if (!Platform.isTV) {
            console.log("W3cMediaApp::shakaplayer: For non-TV devices, max resolution is capped to FHD.");
            this.setting_.abrMaxWidth = Math.min(1919, this.setting_.abrMaxWidth as number);
            this.setting_.abrMaxHeight = Math.min(1079, this.setting_.abrMaxHeight as number);
        }

        console.log(`ABR Max Resolution: ${this.setting_.abrMaxWidth} x ${this.setting_.abrMaxHeight}`);
        this.player.configure({
          preferredVideoCodecs : [content.vcodec],
          preferredAudioCodecs : [content.acodec],
          ...(Object.hasOwn(content, 'preferredAudioLanguage') && { 
            preferredAudioLanguage: content.preferredAudioLanguage 
          }),
          streaming: {
            lowLatencyMode: false,
            inaccurateManifestTolerance: 0,
            rebufferingGoal: 0.01,
            bufferingGoal: 10,
            bufferBehind: 10,
            alwaysStreamText: true,
            retryParameters : {
              maxAttempts: 3,
            },
            infiniteLiveStreamDuration: true,
            dispatchAllEmsgBoxes: true,
          },
          manifest: {
            dash: {
              disableXlinkProcessing: true,
            },
            hls: {
              useSafariBehaviorForLive: false,
              disableClosedCaptionsDetection: true,
            }
          },
          abr : {
            enabled: this.setting_.abrEnabled,
            restrictions : {
              minWidth : 320,
              minHeight : 240,
              maxWidth : this.setting_.abrMaxWidth,
              maxHeight : this.setting_.abrMaxHeight,
            }
          },
          autoShowText: shaka.config.AutoShowText.ALWAYS,
        });

        // Separating the drm configuration since Shaka seems to call drm operations even if they are not needed when drm configuration is present.
        if (content.drm_scheme !== null && content.drm_scheme !== "") {
            console.log(`W3cMediaApp::shakaplayer: loading with ${content.drm_scheme} and ${content.drm_license_uri} and ${content.secure}`);
            let signal_secure : string = 'SW_SECURE_CRYPTO';
            let audio_not_secure : string = 'SW_SECURE_CRYPTO';
            if (content.drm_scheme === 'com.microsoft.playready') {
                signal_secure = '150';
            }

            if (content.secure === "true") {
                if (content.drm_scheme === 'com.microsoft.playready') {
                    signal_secure = '3000';
                } else {
                    signal_secure = 'HW_SECURE_ALL';
                }
            }

            console.log(`W3cMediaApp::shakaplayer: loading with ${content.drm_scheme} and ${content.drm_license_uri} and ${signal_secure}`);

            // For some reason, shaka does not like to use drm_scheme as a key for the map passed as object to configure call.
            // We are forced to create the map and then pass to configure call as in below.
            let server_map : Map<string, string> = {};
            server_map[content.drm_scheme as string] = content.drm_license_uri as string;
            this.player.configure('drm.servers', server_map);

            this.player.configure({
              drm: {
                advanced: {
                  'com.widevine.alpha': {
                    videoRobustness: signal_secure,
                    audioRobustness: audio_not_secure,
                    persistentStateRequired: false,
                  },
                  'com.microsoft.playready': {
                    videoRobustness: signal_secure,
                    audioRobustness: audio_not_secure,
                    persistentStateRequired: false,
                  },
                },
                preferredKeySystems: [
                  content.drm_scheme
                ],
              },
            });
        }
        if (content.custom_pssh === "true") {
            console.log('Overriding manifest PSSH and loading custom');
            const custom = (initData : ArrayBuffer | ArrayBufferView ,
                            initDataType : ArrayBuffer | ArrayBufferView | string ,
                            drmInfo?: shaka.extern.DrmInfo ) : Uint8Array  => {
                return this.initDataTransform(initData, initDataType, drmInfo);
            }
            this.player.configure('drm.initDataTransform', custom);
        }
        console.log("W3cMediaApp::shakaplayer: loading container:" + content.container.toUpperCase());
        if (content.type && content.type === 'HLS' &&
          content.container && content.container.toUpperCase() !== 'MPEG2TS') {
          // In 4.8.5 shakaplayer, sequenceMode == true for HLS.
          // Disabling sequenceMode for formats other than MP2T for now.
          this.player.configure('manifest.hls.sequenceMode', false);
        }
        if (content.hasOwnProperty('ignoreTextTrackFailure') &&
            content.ignoreTextTrackFailure === 'true') {
          console.info("shakaplayer: Ignore textTrack failures");
          this.player.configure('streaming.ignoreTextStreamFailures', true);
          this.player.configure('mediaSource.ignoreTextStreamFailures', true);
        }

        let startPosition = 0;
        if(content.start_position !== undefined) {
          startPosition = content.start_position;
        } else {
          startPosition = this.setting_.startPosition;
        }

        /* Reference lib/debug/log.js
         * NONE: 0,
         * ERROR: 1,
         * WARNING: 2,
         * INFO: 3,
         * DEBUG: 4,
         * V1: 5,
         * V2: 6,
         */
        let level: number = shaka.log.Level.INFO;
        console.info('W3cMediaApp::shakaplayer: Configure log level='+level);
        shaka.log.setLevel(level);

        try {
          await this.player.load(content.uri, startPosition);
        } catch (error) {
          console.error("W3cMediaApp::shakaplayer: load failed");
          this.shakaError(error);
          return; 
        }

        if (this.loadOOBSubtitlesShaka_) {
          this.loadOOBSubtitlesShaka_ = false;
          await this.loadOOBSubtitlesShaka(content);
        }
        console.log("W3cMediaApp::shakaplayer: setTextTrackVisibility to true");
        this.player.setTextTrackVisibility(true);
    }

    override async unload() : Promise<void> {
      console.log('W3cMediaApp::shakaplayer:unload');

      // https://shaka-player-demo.appspot.com/docs/api/shaka.extern.html#.Stats
      let stats : shaka.extern.Stats = this.player.getStats();
      console.info('W3cMediaApp::shakaplayer: Playback Stats ->' + JSON.stringify(stats, null , 4));

      this.mediaElement?.pause();
      try {
        await this.player.unload();
      } catch (error) {
        console.error("W3cMediaApp::shakaplayer: unload failed");
        this.shakaError(error);
      }

      try {
        await this.player.detach();
      } catch (error) {
        console.error("W3cMediaApp::shakaplayer: detach failed");
        this.shakaError(error);
      }
    }
  
    override async destroy(): Promise<void> {
      console.log('W3cMediaApp::shakaplayer:destroy');
      await this.unload();
      try {
        await this.player?.destroy();
      } catch (error) {
        console.error("W3cMediaApp::shakaplayer: destroy failed");
        this.shakaError(error);
      }
      this.player = null;
    }

    override getAudioLanguages() : string [] {
      return this.player?.getAudioLanguages();
    }

    override selectAudioLanguage(language: string): void {
      this.player?.selectAudioLanguage(language);
    }

    override getTextTracks() : TextTrackInfo[] {
      let textTrackInfoList : TextTrackInfo[] = [];

      if (this.player) {
        let shakaTextTrackList = this.player.getTextTracks();
        for (let track of shakaTextTrackList) {
          textTrackInfoList.push({
            id: 'shaka:' + track.id.toString(),
            kind: track.kind,
            language: track.language,
            label: track.label,
            mode: (track.active === true ? 'showing' : 'hidden'),
            playerTrackData: ({type: 'shaka', track: track}),
          });
        }
      }

      if (this.mediaElement) {
        let nativeTextTrackList = this.mediaElement.textTracks;
        for (let track of nativeTextTrackList) {
          if (track.label == 'Shaka Player TextTrack') {
              continue;
          }
          textTrackInfoList.push({
            id: 'native:' + track.id.toString(),
            kind: track.kind,
            language: track.language,
            label: track.label,
            mode: track.mode,
            playerTrackData : ({type: 'native', track: track}),
          });
        }
      }
      console.log(`W3cMediaApp::shakaplayer: getTextTracks length=${textTrackInfoList.length}`);
      return textTrackInfoList;
    }

    override async setTextTrack(newTrack: TextTrackInfo|null, currTrack: TextTrackInfo|null) : void {
      if (currTrack) {
        if (currTrack.playerTrackData.type == 'native') {
            console.log(`W3cMediaApp::shakaplayer:setTextTrack: disable native track, id ${currTrack.id}`);
            currTrack.playerTrackData.track.mode = 'hidden';
        } else if (currTrack.playerTrackData.type == 'shaka') {
            console.log(`W3cMediaApp::shakaplayer:setTextTrack: disable shaka track, id ${currTrack.id}`);
            await this.player?.setTextTrackVisibility(false);
        } else {
            console.warn('W3cMediaApp::shakaplayer:setTextTrack: invalid old text track info');
        }
      }
      if (newTrack) {
        if (newTrack.playerTrackData.type == 'native') {
            console.log(`W3cMediaApp::shakaplayer:setTextTrack: enable native track, id ${newTrack.id}`);
            newTrack.playerTrackData.track.mode = 'showing';
        } else if (newTrack.playerTrackData.type == 'shaka') {
            console.log(`W3cMediaApp::shakaplayer:setTextTrack: enable shaka track, id ${newTrack.id}`);
            this.player?.selectTextTrack(newTrack.playerTrackData.track);
            await this.player?.setTextTrackVisibility(true);
        } else {
            console.warn('W3cMediaApp::shakaplayer:setTextTrack: invalid new text track info');
        }
      }
    }

    override loadOOBSubtitles(content: any) {
      if ((content.subtitles !== undefined) && (content.type !== 'FLAT') ) {
        console.log(`W3cMediaApp::shakaplayer: loadOOBSubtitles for content type: ${content.type} deferred`);
        // shakaplayer allows text track addition only in loaded state,
        // defer load activity to meet that requirement
        this.loadOOBSubtitlesShaka_ = true;
      } else {
        super.loadOOBSubtitles(content);
      }
    }

    private async loadOOBSubtitlesShaka(content: any) {
      console.log(`W3cMediaApp::shakaplayer: loadOOBSubtitles for content type: ${content.type} with uri: ${content.uri}`);
      let defaultTrackSet: boolean = false;
      for (let subtitle of content.subtitles) {
        console.log(`W3cMediaApp::shakaplayer: loadOOBSubtitles uri: ${subtitle.uri} \
            lang: ${subtitle.language}, label: ${subtitle.label}, mime_type: ${subtitle.mime_type}`);
        const oobTrack = await this.player.addTextTrackAsync(subtitle.uri, subtitle.language, 'subtitles',
            null, null, subtitle.label);
        if (!defaultTrackSet) {
            console.log(`W3cMediaApp::shakaplayer: loadOOBSubtitles, Selecting subtitles uri: ${subtitle.uri} by default`);
            this.player.selectTextTrack(oobTrack);
            defaultTrackSet = true;
        }
      }
    }

    override addPlayerEventListener(type: string, listener: any, options?: any) {
      if (!this.player) {
        console.log(`W3cMediaApp::shakaplayer: addPlayerEventListener, called when not initialized`);
        return;
      }

      switch (type) {
        case "timedmetadata":
             this.registerTimedMetadataEvent(listener);
             break;
        case "error":
             this.player.addEventListener('error', (event) => {
               listener({
                 playerType: 'SHAKA',
                 errorCode: event.detail.code.toString(),
                 errorMessage: event.detail.message
               });
             });
             break;
        case "debug":
             this.registerStatesEvents(listener);
             this.registerNetworkEvents(listener);
             this.registerPlaybackEvents(listener);
             break;
        default:
             if (options) {
               this.player.addEventListener(type, listener, options);
             } else {
               this.player.addEventListener(type, listener);
             }
             break;
      }
    }

    override removePlayerEventListener(type: string, listener: any, options?: any) {
      if (!this.player) {
        console.log(`W3cMediaApp::shakaplayer: removePlayerEventListener, called when not initialized`);
        return;
      }

      switch (type) {
        case "timedmetadata":
             this.player.removeEventListener("metadata", listener);
             this.player.removeEventListener("emsg", listener);
             this.player.removeEventListener("timelineregionadded", listener);
             break;
        case "states":
             this.player.removeEventListener("statechanged", listener);
             this.player.removeEventListener("onstatechange", listener);

             this.player.removeEventListener("DownloadCompleted", listener);
             this.player.removeEventListener("downloadfailed", listener);
             this.player.removeEventListener("DownloadHeadersReceived", listener);

             this.player.removeEventListener("loading", listener);
             this.player.removeEventListener("loaded", listener);
             this.player.removeEventListener("manifestparsed", listener);
             this.player.removeEventListener("manifestupdated", listener);
             this.player.removeEventListener("segmentappended", listener);
             this.player.removeEventListener("stalldetected", listener);
             this.player.removeEventListener("drmsessionupdate", listener);
             this.player.removeEventListener("unloading", listener);
             break;
        default:
             if (options) {
               this.player.removeEventListener(type, listener, options);
             } else {
               this.player.removeEventListener(type, listener);
             }
             break;
      }
    }
}
