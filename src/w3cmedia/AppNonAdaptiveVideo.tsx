/*
 * Copyright (c) 2024 Amazon.com, Inc. or its affiliates.  All rights reserved.
 *
 * PROPRIETARY/CONFIDENTIAL.  USE IS SUBJECT TO LICENSE TERMS.
 */

import * as React from "react";
import { useRef } from "react";
import { useWindowDimensions, View, StyleSheet } from "react-native";

import { Video } from "@amazon-devices/react-native-w3cmedia";

// set to false if app wants to call play API on video manually
const AUTOPLAY = true;

const content = {
  uri: "https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd",
};

export const App = () => {
  const video = useRef<Video | null>(null);
  // Render in Full screen resolution
  const { width: deviceWidth, height: deviceHeight } = useWindowDimensions();

  console.log("AppNonAdaptiveVidoe v1.0");

  return (
    <View style={styles.videoContainer}>
      <Video
        autoplay={AUTOPLAY}
        src={content.uri}
        width={deviceWidth}
        height={deviceHeight}
        controls={true}
        ref={(ref) => {
          video.current = ref;
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  videoContainer: {
    backgroundColor: "white",
    alignItems: "stretch",
  },
});
