/*
 * Copyright (c) 2024 Amazon.com, Inc. or its affiliates.  All rights reserved.
 *
 * PROPRIETARY/CONFIDENTIAL.  USE IS SUBJECT TO LICENSE TERMS.
 */

import * as React from 'react';
import {useRef, useState, useEffect, useReducer} from 'react';
import {
  Platform,
  useWindowDimensions,
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
} from 'react-native';

import {
  VideoPlayer,
  KeplerVideoSurfaceView,
  KeplerCaptionsView,
} from '@amazon-devices/react-native-w3cmedia';
import {ShakaPlayer, ShakaPlayerSettings} from './shakaplayer/ShakaPlayer';

// set to false if app wants to call play API on main video manually
const AUTOPLAY = true;

const DEFAULT_ABR_WIDTH: number = Platform.isTV ? 3840 : 1919;
const DEFAULT_ABR_HEIGHT: number = Platform.isTV ? 2160 : 1079;

const TICK_PERIOD = 250; // in ms

const content = [
  {
    secure: 'false', // true : Use Secure Video Buffers. false: Use Unsecure Video Buffers.
    uri: 'https://storage.googleapis.com/exoplayer-test-media-1/60fps/bbb-clear-2160/manifest.mpd',
    drm_scheme: '', // com.microsoft.playready, com.widevine.alpha
    drm_license_uri: '', // DRM License acquisition server URL : needed only if the content is DRM protected
  },
  // Ad content
  {
    secure: 'false', // true : Use Secure Video Buffers. false: Use Unsecure Video Buffers.
    uri: 'https://storage.googleapis.com/exoplayer-test-media-1/gen-3/screens/dash-vod-single-segment/video-137.mp4',
    drm_scheme: '', // com.microsoft.playready, com.widevine.alpha
    drm_license_uri: '', // DRM License acquisition server URL : needed only if the content is DRM protected
  },
];

const STATES = {
  IDLE: 'IDLE',
  INIT: 'INIT',
  MAIN_PLAYING: 'MAIN_PLAYING',
  AD_PLAYING: 'AD_PLAYING',
  MAIN_POSTAD_PLAYING: 'MAIN_POSTAD_PLAYING',
  END: 'END',
};

const ACTIONS = {
  PLAY_MAIN: 'PLAY_MAIN',
  PLAY_AD: 'PLAY_AD',
  END_ACTION: 'END_ACTION',
  IDLE_ACTION: 'IDLE_ACTION',
  SET_MAIN_PLAYER: 'SET_MAIN_PLAYER',
  SET_AD_PLAYER: 'SET_AD_PLAYER',
  SET_CACHED_SURFACE: 'SET_CACHED_SURFACE',
  SET_SHAKA_PLAYER: 'SET_SHAKA_PLAYER',
  SET_AD_PLAYED: 'SET_AD_PLAYED',
  SET_AD_PLAYER_INITIALIZED: 'SET_AD_PLAYER_INITIALIZED',
  SET_TIMEOUT_ID: 'SET_TIMEOUT_ID',
  TICK: 'TICK',
};

// Define the reducer function for state transitions

const reducer = (state: any, action: any) => {
  switch (action.type) {
    case ACTIONS.IDLE_ACTION:
      return {...state, status: STATES.IDLE};
    case ACTIONS.PLAY_MAIN:
      if (state.status === STATES.INIT || state.status === STATES.IDLE) {
        console.log('xreducer: ACTION.PLAY_MAIN -> MAIN_PLAYING');
        return {...state, status: STATES.MAIN_PLAYING};
      } else if (state.status === STATES.AD_PLAYING) {
        console.log('xreducer: ACTION.PLAY_MAIN -> POSTAD_PLAYING');
        return {...state, status: STATES.MAIN_POSTAD_PLAYING};
      } else {
        console.log('Invalid PLAY_MAIN action in state = ', state.status);
      }
      break;
    case ACTIONS.PLAY_AD:
      if (state.status === STATES.MAIN_PLAYING) {
        return {...state, status: STATES.AD_PLAYING};
      } else {
        console.log('Invalid PLAY_AD action in state =', state.status);
      }
      break;
    case ACTIONS.END_ACTION:
      console.log('xreducer: ACTION.END_ACTION');
      return {...state, status: STATES.END};
    case ACTIONS.TICK:
      console.log('xreducer: ACTION.TICK');
      return {...state, tick: state.tick + 1};
    case ACTIONS.SET_AD_PLAYER:
      console.log('xreducer: ACTION.SET_AD_PLAYER');
      return {...state, adPlayer: action.payload};
    case ACTIONS.SET_MAIN_PLAYER:
      console.log('xreducer: ACTION.SET_MAIN_PLAYER');
      return {...state, mainPlayer: action.payload};
    case ACTIONS.SET_SHAKA_PLAYER:
      console.log('xreducer: ACTION.SET_SHAKA_PLAYER');
      return {...state, shakaPlayer: action.payload};
    case ACTIONS.SET_CACHED_SURFACE:
      console.log('xreducer: ACTION.SET_CACHED_SURFACE');
      return {...state, cachedSurface: action.payload};
    case ACTIONS.SET_TIMEOUT_ID:
      return {...state, timeoutId: action.payload};
    case ACTIONS.SET_AD_PLAYED:
      return {...state, adPlayed: true};
      case ACTIONS.SET_AD_PLAYER_INITIALIZED:
        return {...state, adPlayerInitialized: true};
    default:
      console.log('reducer unkonwn action action.type = ', action.type);
  }
  return state;
};

const initReducer = (initialArg: any) => {
  return {
    status: STATES.INIT,
    adPlayer: null,
    mainPlayer: null,
    shakaPlayer: null,
    cachedSurface: null,
    adEngineTimer: null,
    mainContent: content[0], // main content
    adUrl: content[1].uri, // ad content
    adStart: 10, // Start at 5s in main timeline
    adEnd: 10, // Stop ad at 10s in ad timeline
    adPlayed: false,
    adPlayerInitialized: false,
    timeoutId: null,
    tick: 0,
  };
};

// High level walkthrough
// 1. State machine has INIT, IDLE, MAIN_PLAYING, AD_PLAYING, and MAIN_POSTAD_PLAYING
// 2. INIT state initializes two players, a mse player for main content playback and
//    a url player for ad content playback. If surface not created, go to IDLE else
//    go to MAIN_PLAYING
// 3. IDLE waits for surface to be created
// 4. MAIN_PLAYING is for main content playback before Ad
// 5. AD_PLAYING is for Ad content playbacku
// 6. MAIN_POSTAD_PLAYING is for main content playback after Ad
// 7. Configuration can be done using the initReducer function above
// 8. Main params to configure are adStart, andEnd times, adUrl content, mainContent

// Define the component
export const App = () => {
  const [buttonPress, setButtonPress] = useState(false);
  const adPlayer = useRef<VideoPlayer | null>(null);
  const mainPlayer = useRef<VideoPlayer | null>(null);
  const shakaPlayer = useRef<any>(null);
  const cachedSurface = useRef<any>(null);
  const timeoutId = useRef<any>(null);

  const currShakaPlayerSettings = useRef<ShakaPlayerSettings>({
    secure: false, // Playback goes through secure or non-secure mode
    abrEnabled: true, // Enables Adaptive Bit-Rate (ABR) switching
    abrMaxWidth: DEFAULT_ABR_WIDTH, // Maximum width allowed for ABR
    abrMaxHeight: DEFAULT_ABR_HEIGHT, // Maximum height allowed for ABR
  });
  const [state, dispatch] = useReducer(reducer, null, initReducer);

  // Main player callbacks and setup
  const onEndedMain = async () => {
    console.log('app: onEndedMain received');
    dispatch({type: ACTIONS.END_ACTION});
  };

  const onPausedMain = (): void => {
    console.log('app: onPausedMain');
    dispatch({type: ACTIONS.PLAY_AD});
  };

  const setupEventListenersMain = (): void => {
    console.log('app: setup event listeners');
    mainPlayer.current?.addEventListener('pause', onPausedMain);
    mainPlayer.current?.addEventListener('ended', onEndedMain);
  };

  const initializeShakaMain = () => {
    console.log('app: in initializeShakaMain()');
    if (mainPlayer.current !== null) {
      shakaPlayer.current = new ShakaPlayer(
        mainPlayer.current,
        currShakaPlayerSettings.current,
      );
    }
    if (shakaPlayer.current !== null) {
      console.log('app: loading main player url');
      shakaPlayer.current.load(state.mainContent, AUTOPLAY); // Main content url set
    }
    dispatch({type: ACTIONS.SET_SHAKA_PLAYER, payload: shakaPlayer});
    console.log('app: initializeShakaMain complete');
  };

  const initializeVideoPlayerMain = async () => {
    console.log('app: calling initializeVideoPlayer');
    mainPlayer.current = new VideoPlayer();
    // @ts-ignore
    global.gmedia = mainPlayer.current;
    await mainPlayer.current.initialize();
    setupEventListenersMain();
    mainPlayer.current!.autoplay = false;
    initializeShakaMain();
    dispatch({type: ACTIONS.SET_MAIN_PLAYER, payload: mainPlayer});
  };

  // Ad player callbacks and setup
  const onPausedAd = (): void => {
    console.log('app: onPausedAd');
    dispatch({type: ACTIONS.PLAY_MAIN});
  };

  const canPlayAd = (): void => {
    console.log('app: onCanPlay Ad');
    mainPlayer.current!.pause();
  };

  const setupEventListenersAd = (): void => {
    console.log('app: setup adPlayer event listeners');
    adPlayer.current?.addEventListener('pause', onPausedAd);
    adPlayer.current?.addEventListener('canplay', canPlayAd);
  };

  const initializePlayerAd = async () => {
    console.log('app: calling initializeAdPlayer');
    adPlayer.current = new VideoPlayer();
    await adPlayer.current.initialize();
    adPlayer.current!.autoplay = false;
    dispatch({type: ACTIONS.SET_AD_PLAYER, payload: adPlayer});
    setupEventListenersAd();
    adPlayer.current.autoplay = false;
    adPlayer.current.src = state.adUrl; // set adPlayer url
    dispatch({type: ACTIONS.SET_AD_PLAYER_INITIALIZED});
  };

  // Helper functions
  const setSurfaceToMainPlayer = (mainPlayback: boolean) => {
    if (
      mainPlayer.current === null ||
      cachedSurface.current === null
    ) {
      console.log('app: setSurface: mainPlayer or surface is null');
      return;
    }
    if (mainPlayback) {
      // set surface to mainPlayer
      (mainPlayer.current as VideoPlayer).setSurfaceHandle(
        cachedSurface.current,
      );
      console.log('app: setting surface to main player');
    } else {
      // set surface to adPlayer
      (adPlayer.current as VideoPlayer).setSurfaceHandle(cachedSurface.current);
      console.log('app: setting surface to ad player');
    }
  };

  const handleInit = async () => {
    if (mainPlayer.current !== null) {
      console.log(
        'Init complete, return early from handleInit mainPlayer =',
        mainPlayer);
      return;
    }
    await initializeVideoPlayerMain();
    console.log('app: initializePlayers complete');
    if (cachedSurface.current) {
      dispatch({type: ACTIONS.PLAY_MAIN});
    } else {
      // delay playback till surface created
      dispatch({type: ACTIONS.IDLE_ACTION});
    }
  };

  // Cleanup
  const cleanEventListeners = (): void => {
    console.log('app: remove event listeners');
    state.mainPlayer.current?.removeEventListener('ended', onEndedMain);
    state.mainPlayer.current?.removeEventListener('pause', onPausedMain);
    state.adPlayer.current?.removeEventListener('pause', onPausedAd);
  };

  const cleanupPlayers = async () => {
    await state.mainPlayer.current?.deinitialize();
    await state.adPlayer.current?.deinitialize();
    global.gmedia = null;
  };

  // Initialize at component mount
  useEffect(() => {
    console.log('app: useEffect mm initial v1.9');
    mainPlayer.current = null;
    timeoutId.current = null;
    shakaPlayer.current = null;
    cachedSurface.current = null;
    return () => {
      console.log('app: useEffect mm cleanup');
    };
  }, []);

  // State machine handlers
  const handleMainPlaying = () => {
    if (mainPlayer.current?.paused) {
      setSurfaceToMainPlayer(true);
      console.log('app: main player set surface and call play');
      mainPlayer.current!.play();
    }

    if (state.adPlayed) {
      console.log(
        'app: new state = MAIN_POSTAD_PLAYING, adPlayed is set, return early from handleMainPlaying',
      );
      return;
    }

    console.log('app: adStart = ', state.adStart);
    console.log('app: currentTime  = ', mainPlayer.current!.currentTime);
    console.log(
      'app: new state  = MAIN_PLAYING',
      mainPlayer.current!.currentTime,
    );
    if (mainPlayer.current!.currentTime >= state.adStart && !state.adPlayerInitialized) {
      initializePlayerAd();
    }
    if (timeoutId.current === null) {
      console.log('app: create timeout');
      timeoutId.current = setInterval(() => {
        console.log('app: tick');
        dispatch({type: ACTIONS.TICK});
      }, TICK_PERIOD);
      dispatch({type: ACTIONS.SET_TIMEOUT_ID, payload: timeoutId});
    }
  };

  const handleAdPlaying = () => {
    console.log(
      'app: new state = AD_PLAYING, adPlayer.current!.paused = ',
      adPlayer.current!.paused,
    );
    if (adPlayer.current!.paused) {
      console.log('app: switch surface to Ad Player and start playback');
      setSurfaceToMainPlayer(false);
      dispatch({type: ACTIONS.SET_AD_PLAYED});
      adPlayer.current!.play();
    }

    console.log(
      'app: adPlayer.current!.currentTime =',
      adPlayer.current!.currentTime,
    );
    if (adPlayer.current!.currentTime >= state.adEnd) {
      console.log(
        'app: adPlayer.current!.currentTime >= state.adEndi, ad pause called',
      );
      adPlayer.current!.pause(); // dispatch in pause callback
    }
  };

  useEffect(() => {
    switch (state.status) {
      case STATES.INIT:
        console.log('app: new state = INIT');
        handleInit();
        break;

      case STATES.IDLE:
        console.log('app: new state = IDLE');
        break;

      case STATES.MAIN_PLAYING:
        console.log('app: new state = MAIN_PLAYING');
        handleMainPlaying();
        break;

      case STATES.AD_PLAYING:
        console.log('app: new state = AD_PLAYING');
        handleAdPlaying();
        break;

      case STATES.MAIN_POSTAD_PLAYING:
        console.log(
          'app: new state = MAIN_POSTAD_PLAYING, switch surface to main player',
        );
        console.log('app: adPlayed = ', state.adPlayed);
        handleMainPlaying();
        clearInterval(state.timeoutId.current);
        break;

      case STATES.END:
        // cleanup
        state.shakaPlayer.current.unload();
        state.shakaPlayer.current = null;
        cleanEventListeners();
        cleanupPlayers();
        break;
    }

    return () => {
      console.log('app: return effect');
    };
  }, [state]);

  // Surface callbacks
  const onSurfaceViewCreated = (surfaceHandle: string): void => {
    console.log('app: surface created');
    cachedSurface.current = surfaceHandle;
    dispatch({
      type: ACTIONS.SET_CACHED_SURFACE,
      payload: cachedSurface,
    });
    if (state.status === STATES.IDLE) {
      console.log('app: Scheduling main playback from IDLE');
      dispatch({type: ACTIONS.PLAY_MAIN});
    }
  };

  const onSurfaceViewDestroyed = (surfaceHandle: string): void => {
    console.log('app: surface destroyed');
    cachedSurface.current = null;
    mainPlayer.current?.clearSurfaceHandle(surfaceHandle);
  };

  const onCaptionViewCreated = (captionsHandle: string): void => {
    console.log('app: caption view created');
    mainPlayer.current?.setCaptionViewHandle(captionsHandle); // check if needed
  };

  if (!buttonPress) {
    console.log('app: false button press');
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            setButtonPress(true);
          }}
          hasTVPreferredFocus={true}
          activeOpacity={1}>
          <Text style={styles.buttonLabel}> Press to Play Video </Text>
        </TouchableOpacity>
      </View>
    );
  } else {
    return (
      <View style={styles.videoContainer}>
        <KeplerVideoSurfaceView
          style={styles.surfaceView}
          onSurfaceViewCreated={onSurfaceViewCreated}
          onSurfaceViewDestroyed={onSurfaceViewDestroyed}
        />
        <KeplerCaptionsView
          onCaptionViewCreated={onCaptionViewCreated}
          style={styles.captionView}
        />
      </View>
    );
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: '#283593',
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#303030',
    borderColor: 'navy',
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  buttonLabel: {
    color: 'white',
    fontSize: 22,
    fontFamily: 'Amazon Ember',
  },
  videoContainer: {
    backgroundColor: 'white',
    alignItems: 'stretch',
  },
  surfaceView: {
    zIndex: 0,
  },
  captionView: {
    width: '100%',
    height: '100%',
    top: 0,
    left: 0,
    position: 'absolute',
    backgroundColor: 'transparent',
    flexDirection: 'column',
    alignItems: 'center',
    zIndex: 2,
  },
});

