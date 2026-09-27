/*
* Copyright (c) 2025 Amazon.com, Inc. or its affiliates.  All rights reserved.
*
* PROPRIETARY/CONFIDENTIAL.  USE IS SUBJECT TO LICENSE TERMS.
*/

// DEMO MODE CONFIGURATION:
// This demo showcases two different approaches to VOD ad insertion using dual players:
//
// 1. 'pre-buffered-seamless' (AUTOPLAY=false): Seamless ad insertion with background pre-loading
//    - Uses two VideoPlayer instances
//    - Ad content pre-buffers in background while main content continues playing
//    - Ad player emits 'canplay' event when fully prepared for playback
//    - Main content pauses only when both ad is ready and insertion time is reached
//    - Seamless switch to ad player without buffering delays and visual gaps
//
// 2. 'instant-with-gap' (AUTOPLAY=true): Standard VOD ad insertion with immediate playback
//    - Uses two VideoPlayer instances
//    - Pauses main content and clears surface before initializing ad player
//    - Ad player starts automatically once initialized (autoplay=true)
//    - May show brief black screen during ad player initialization

import * as React from 'react';
import {useRef, useState, useEffect} from 'react';
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
} from '@amzn/react-native-w3cmedia';
import {ShakaPlayer, ShakaPlayerSettings} from './shakaplayer/ShakaPlayer';

const DEFAULT_ABR_WIDTH: number = Platform.isTV ? 3840 : 1919;
const DEFAULT_ABR_HEIGHT: number = Platform.isTV ? 2160 : 1079;

// Ad pre-loading window in seconds - how early to start loading ads before their start time
const AD_PRELOAD_WINDOW_SECONDS = 5;

// ============================================================================
// CONTENT CONFIGURATION
// ============================================================================

// VOD Content - Used when AUTOPLAY = false (Seamless Ad Insertion Demo)
const vodContent = [
  {
    secure: 'false',
    uri: 'https://storage.googleapis.com/shaka-demo-assets/sintel-fmp4-aes/master.m3u8',
    drm_scheme: '',
    drm_license_uri: '',
  }
];

// Hardcoded ad content list for fixed CSAI mode
const hardcodedAdContents = [
  {
    title: 'Fixed Ad 1',
    secure: 'false',
    uri: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    drm_scheme: '',
    drm_license_uri: '',
    container: 'FMP4',
    startTime: 20,
    duration: 15,
    skipAfter: 5,
    status: "",
  },
  {
    title: 'Fixed Ad 2',
    secure: 'false',
    uri: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    drm_scheme: '',
    drm_license_uri: '',
    container: 'FMP4',
    startTime: 40,
    duration: 15,
    skipAfter: 5,
    status: "",
  }
];

export const App = () => {
  const currShakaPlayerSettings = useRef<ShakaPlayerSettings>({
    secure: false, // Playback goes through secure or non-secure mode
    abrEnabled: true, // Enables Adaptive Bit-Rate (ABR) switching
    abrMaxWidth: DEFAULT_ABR_WIDTH, // Maximum width allowed for ABR
    abrMaxHeight: DEFAULT_ABR_HEIGHT, // Maximum height allowed for ABR
  });
  const player = useRef<any>(null);
  const videoPlayer = useRef<VideoPlayer | null>(null);
  const adVideoPlayer = useRef<VideoPlayer | null>(null);
  const cachedSurface = useRef<any>(null);
  const [playerSettings, setPlayerSettings] = useState<ShakaPlayerSettings>(
    currShakaPlayerSettings.current,
  );

  // CSAI-specific state variables from reference implementation
  const [adTimer, setAdTimer] = useState<string>('---');
  const currentAdRef = useRef<any>(null);

  // CSAI technique: 'off' or 'fixed' (hardcoded CSAI)
  const [csaiTechnique, setCsaiTechnique] = useState<string>('off');
  const csaiTechniqueRef = useRef<string>('off');

  // Ad mode: 'pre-buffered-seamless' or 'instant-with-gap'
  const [adMode, setAdMode] = useState<string>('pre-buffered-seamless');
  const adModeRef = useRef<string>('pre-buffered-seamless');
  
  // Track if demo has started
  const [demoStarted, setDemoStarted] = useState<boolean>(false);

  // Render in Full screen resolution
  const {width: deviceWidth, height: deviceHeight} = useWindowDimensions();

  useEffect(() => {
    console.log('app: start AppAdInsertionDemo v14.0');
  }, []);

  // Sync csaiTechnique state with ref for use in listeners
  useEffect(() => {
    csaiTechniqueRef.current = csaiTechnique;
  }, [csaiTechnique]);

  // Sync adMode state with ref for use in listeners
  useEffect(() => {
    adModeRef.current = adMode;
  }, [adMode]);

  // ============================================================================
  // MAIN PLAYER EVENT HANDLERS
  // ============================================================================

  /**
   * Handles pause events from the main video player
   * - autoload-ad: Clears surface, initializes ad player, and assigns surface to ad
   * - seamless-ad: Switches surface to pre-initialized ad player and starts playback
   */
  const onPaused = async () => {
    console.log('app: onPaused');
    if (adModeRef.current === 'instant-with-gap') {
      // Clear main player surface and initialize ad player on-demand
      videoPlayer.current?.clearSurfaceHandle(cachedSurface.current);
      try {
        await initializeAdVideoPlayer();
      } catch (error) {
        console.error('Failed to initialize ad video player:', error);
      }
      adVideoPlayer.current?.setSurfaceHandle(cachedSurface.current);
    } else if (adModeRef.current === 'pre-buffered-seamless') {
      // Switch to pre-initialized ad player for seamless transition
      videoPlayer.current?.clearSurfaceHandle(cachedSurface.current);
      adVideoPlayer.current?.setSurfaceHandle(cachedSurface.current);
      adVideoPlayer.current?.play();
    }
  };

  /**
   * Handles end of main content playback
   * Cleans up current player and switches to next VOD content
   */
  const onEnded = async () => {
    console.log('app: onEnded');
    removeEventListeners();
    player.current.unload();
    await videoPlayer.current?.deinitialize();
    onVideoUnMounted();
  };

  /**
   * Monitors playback time and triggers CSAI ad insertion based on hardcoded ad timing
   * Uses different strategies based on ad mode:
   * - pre-buffered-seamless: Pre-initializes ad player for smooth transition
   * - instant-with-gap: Pauses main content to trigger ad insertion flow
   */
  const onTimeUpdate = () => {
    console.log('app: onTimeUpdate currentTime:', videoPlayer.current?.currentTime);
    if (!videoPlayer.current) return;
    const currentTime = videoPlayer.current.currentTime;


    //Play the ads which are ready if the time is more then there start time and marks the status
    const currentAd = currentAdRef.current;
    if (currentAd && currentAd.status === "ready") {
      if (currentTime < currentAd.startTime) {
        return;
      }
      console.log(`Starting ready ad at ${currentAd.startTime}s`);
      videoPlayer.current?.pause();
      currentAd.status = "started";
      return;
    }

    // CSAI timing logic - only fixed mode
    if (csaiTechniqueRef.current === 'fixed') {
      const nextAd = hardcodedAdContents.find(ad =>
        currentTime + AD_PRELOAD_WINDOW_SECONDS >= ad.startTime && ad.status === ""
      );

      if (nextAd) {
        console.log(`Fixed mode ad loading at ${currentTime}s for playback at ${nextAd.startTime}s`);
        currentAdRef.current = nextAd;

        const selectedMode = adModeRef.current;
        if (selectedMode === 'pre-buffered-seamless') {
          console.log('Pre-loading ad, waiting for scheduled time');
          currentAdRef.current.status = "picked";
          try {
            initializeAdVideoPlayer();
          } catch (error) {
            console.error('Failed to initialize ad video player:', error);
          }
        } else {
          console.log('Starting ad immediately');
          currentAdRef.current.status = "started";
          videoPlayer.current?.pause();
        }
      }
    }
  };

  /**
   * Handles playback errors from the main video player
   */
  const onError = () => {
    console.log('app: onError');
  };

  /**
   * Registers event listeners for the main video player
   * All events are used by both demo modes with different behaviors
   */
  const setUpEventListeners = (): void => {
    console.log('app: setUpEventListeners');
    videoPlayer.current?.addEventListener('pause', onPaused);
    videoPlayer.current?.addEventListener('ended', onEnded);
    videoPlayer.current?.addEventListener('timeupdate', onTimeUpdate);
    videoPlayer.current?.addEventListener('error', onError);
  };

  /**
   * Removes all event listeners from the main video player
   * Called during cleanup to prevent memory leaks
   */
  const removeEventListeners = (): void => {
    console.log('app: removeEventListeners');
    videoPlayer.current?.removeEventListener('ended', onEnded);
    videoPlayer.current?.removeEventListener('pause', onPaused);
    videoPlayer.current?.removeEventListener('timeupdate', onTimeUpdate);
    videoPlayer.current?.removeEventListener('error', onError);
  };

  // ============================================================================
  // AD PLAYER EVENT HANDLERS
  // ============================================================================

  /**
   * Handles end of ad playback
   * Returns surface to main player, cleans up ad player, and resumes main content
   */
  const onAdEnded = async () => {
    console.log('app: onAdEnded');
    
    // Reset ad timer and current ad reference
    setAdTimer('---');
    if (currentAdRef.current) {
      currentAdRef.current = null;
    }
    
    // Clear ad surface and cleanup ad player
    adVideoPlayer.current?.clearSurfaceHandle(cachedSurface.current);
    cleanupAdPlayer();
    
    // Resume main content
    videoPlayer.current?.setSurfaceHandle(cachedSurface.current);
    videoPlayer.current?.play();
  };

  const cleanupAdPlayer = () => {
    console.log('app: Cleaning up ad player');
    removeEventListenersAd();
    if (adVideoPlayer.current) {
      adVideoPlayer.current.deinitializeSync(1000);
      adVideoPlayer.current = null;
    }
  };

  /**
   * Triggered when ad player is ready to play (seamless-ad mode only)
   * Pauses main content to enable smooth surface transition
   */
  const canPlayAd = (): void => {
    console.log('app: canPlayAd');
    const currentAdMode = adModeRef.current;
    const currentAd = currentAdRef.current;

    if (currentAdMode === 'pre-buffered-seamless' && currentAd && currentAd.status === "picked") {
      currentAd.status = "ready";
    }
  };

  /**
   * Registers event listeners for the ad video player
   * canplay listener is only added for seamless-ad mode for smooth transitions
   */
  const setUpEventListenersAd = (): void => {
    console.log('app: setUpEventListenersAd');
    adVideoPlayer.current?.addEventListener('ended', onAdEnded);
    adVideoPlayer.current?.addEventListener('timeupdate', updateAdTimer);

    // Seamless mode: Listen for ad readiness to trigger smooth transition
    if (adModeRef.current === 'pre-buffered-seamless') {
      adVideoPlayer.current?.addEventListener('canplay', canPlayAd);
    }
  };

  /**
   * Removes event listeners from the ad video player
   * Only removes canplay listener if it was added for seamless-ad mode
   */
  const removeEventListenersAd = (): void => {
    console.log('app: removeEventListenersAd');
    adVideoPlayer.current?.removeEventListener('ended', onAdEnded);
    adVideoPlayer.current?.removeEventListener('timeupdate', updateAdTimer);
    
    if (adModeRef.current === 'pre-buffered-seamless') {
      adVideoPlayer.current?.removeEventListener('canplay', canPlayAd);
    }
  };

  // ============================================================================
  // PLAYER INITIALIZATION
  // ============================================================================

  /**
   * Initializes the main video player with Shaka Player integration
   * Sets up event listeners and configures autoplay based on demo mode
   */
  const initializeVideoPlayer = async () => {
    console.log('app: initializeVideoPlayer');
    videoPlayer.current = new VideoPlayer();
    global.gmedia = videoPlayer.current;
    await videoPlayer.current.initialize();
    setUpEventListeners();
    videoPlayer.current!.autoplay = true;
    initializeShaka();
  };

  /**
   * Initializes the ad video player for midroll ad insertion
   * Configures autoplay and sets up ad-specific event listeners
   */
  const initializeAdVideoPlayer = async () => {
    console.log('app: initializeAdVideoPlayer');
    adVideoPlayer.current = new VideoPlayer();
    await adVideoPlayer.current.initialize();
    adVideoPlayer.current!.autoplay = (adModeRef.current === 'instant-with-gap');
    setUpEventListenersAd();
    adVideoPlayer.current.src = currentAdRef.current.uri;
};

  const onSurfaceViewCreated = (surfaceHandle: string): void => {
    console.log('app: onSurfaceViewCreated');
    cachedSurface.current = surfaceHandle;
    videoPlayer.current?.setSurfaceHandle(surfaceHandle);
  };

  const onSurfaceViewDestroyed = (surfaceHandle: string): void => {
    console.log('app: onSurfaceViewDestroyed');
    videoPlayer.current?.clearSurfaceHandle(surfaceHandle);
    cachedSurface.current = null;
  };

  const onCaptionViewCreated = (captionsHandle: string): void => {
    console.log('app: onCaptionViewCreated');
    videoPlayer.current?.setCaptionViewHandle(captionsHandle);
  };

  const initializeShaka = () => {
    console.log('app: initializeShaka');
    if (videoPlayer.current !== null) {
      player.current = new ShakaPlayer(videoPlayer.current, playerSettings);
    }
    if (player.current !== null) {
      player.current.load(vodContent[0], true);
    }
  };

  const onVideoUnMounted = (): void => {
    console.log('app: onVideoUnMounted');
    global.gmedia = null;
    player.current = null;
    videoPlayer.current = null;
  };

  const handleSkipAd = async (): Promise<void> => {
    console.log('app: Skip ad pressed');
    await onAdEnded();
  };

  // Update ad timer during ad playback
  const updateAdTimer = () => {
    if (currentAdRef.current && currentAdRef.current.status === "started" && adVideoPlayer.current) {
      const currentTime = adVideoPlayer.current.currentTime || 0;
      const remaining = Math.max(0, currentAdRef.current.duration - currentTime);
      const timerValue = Math.ceil(remaining);
      setAdTimer(timerValue + 's');
    }
  };

  const startDemo = async () => {
    console.log('app: Starting demo with ad mode:', adModeRef.current);
    setDemoStarted(true);
    await initializeVideoPlayer();
  };

  if (!demoStarted) {
    return (
      <View style={styles.container}>
        {/* CSAI Technique Button */}
        <TouchableOpacity
          style={[styles.button, {marginTop: 20, backgroundColor: '#4CAF50'}]}
          onPress={() => {
            const nextMode = csaiTechnique === 'off' ? 'fixed' : 'off';
            console.log(`Switching CSAI technique from ${csaiTechnique} to ${nextMode}`);
            setCsaiTechnique(nextMode);
          }}
          activeOpacity={0.7}>
          <Text style={styles.buttonLabel}>CSAI Technique: {csaiTechnique}</Text>
        </TouchableOpacity>
        {/* Ad Mode Button */}
        <TouchableOpacity
          style={[styles.button, {marginTop: 20, backgroundColor: '#FF9800'}]}
          onPress={() => {
            const nextMode = adModeRef.current === 'pre-buffered-seamless' ? 'instant-with-gap' : 'pre-buffered-seamless';
            console.log(`Switching ad mode from ${adModeRef.current} to ${nextMode}`);
            setAdMode(nextMode);
          }}
          activeOpacity={0.7}>
          <Text style={styles.buttonLabel}>Ad Mode: {adMode}</Text>
        </TouchableOpacity>
        {/* Start Button */}
        <TouchableOpacity
          style={[styles.button, {marginTop: 20}]}
          onPress={async () => {
            try {
              await startDemo();
            } catch (error) {
              console.error('Failed to start demo:', error);
            }
          }}
          activeOpacity={0.7}>
          <Text style={styles.buttonLabel}>Start Demo</Text>
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
        
        {/* Ad Timer and Skip Button Overlay */}
        {currentAdRef.current !== null && currentAdRef.current.status === "started" && (
          <View style={styles.adOverlay}>
            <Text style={styles.adTimerText}>
              Ad: {adTimer}
            </Text>
            {currentAdRef.current.skipAfter > 0 &&
             (currentAdRef.current.duration - parseInt(adTimer)) >= currentAdRef.current.skipAfter && (
              <TouchableOpacity style={styles.skipButton} onPress={handleSkipAd}>
                <Text style={styles.skipButtonText}>Skip Ad</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
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
  adOverlay: {
    position: 'absolute',
    top: 20,
    right: 20,
    flexDirection: 'column',
    alignItems: 'flex-end',
    zIndex: 3,
  },
  adTimerText: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: 'white',
    padding: 8,
    borderRadius: 4,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  skipButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  skipButtonText: {
    color: '#333',
    fontSize: 14,
    fontWeight: 'bold',
  },
});