/*
 * Copyright (c) 2024 Amazon.com, Inc. or its affiliates.  All rights reserved.
 *
 * PROPRIETARY/CONFIDENTIAL.  USE IS SUBJECT TO LICENSE TERMS.
 */

// Import the required components from react and react-native packages
import React from 'react';
import {useRef, useEffect, useState} from 'react';
import {View} from 'react-native';

// Import VideoPlayer component from @amzn/react-native-w3cmedia NPM package.
import {VideoPlayer, KeplerVideoView} from '@amazon-devices/react-native-w3cmedia';

// Add your content here
const content = {
  uri: 'https://html5demos.com/assets/dizzy.mp4',
};

export const App = () => {
  // Declare a reference to video component
  const video = useRef<VideoPlayer | null>(null);
  const [useKeplerVideoView, setUseKeplerVideoView] = useState(false);

  useEffect(() => {
    console.log('AppNonAdaptive v1.13');
    initializingPreBuffering();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initializingPreBuffering = async () => {
    video.current = new VideoPlayer();
    await video.current.initialize();
    video.current!.autoplay = false;
    video.current.src = content.uri; // set HTMLMediaElement's src attribute
    setUseKeplerVideoView(true);
    console.log(
          'AppNonAdaptive init complete, setting kepler video view to true',
        );
  };

  // Add KeplerVideoView component to the render tree
  return (
    <View style={{flex: 1}}>
      {useKeplerVideoView ? (
        <KeplerVideoView
          showControls={true}
          videoPlayer={video.current as VideoPlayer}
        />
      ) : null}
    </View>
  );
};
