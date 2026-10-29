import { Canvas, Picture, Skia, SkPicture } from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";

import { CHARACTERS } from "@/src/config/catalog";
import { colors } from "@/src/theme";

import { crashPose, jumpPose, landPose, Pose, RUN_FRAMES, runPose, slidePose, solve } from "./rig";
import { RigPainter } from "./rigDraw";

/** Dev-only contact sheet: every character × run keyframes + jump/land/slide/crash poses. */
export default function RigSheet() {
  const { width } = useWindowDimensions();
  const poses = useMemo<{ name: string; pose: Pose }[]>(() => {
    const run = Array.from({ length: RUN_FRAMES }, (_, i) => ({ name: `run ${i}`, pose: runPose(i / RUN_FRAMES) }));
    return [...run, { name: "takeoff", pose: jumpPose(9) }, { name: "air", pose: jumpPose(0) }, { name: "fall", pose: jumpPose(-8) }, { name: "land", pose: landPose(runPose(0.25), 1) }, { name: "slide", pose: slidePose(0) }, { name: "crash", pose: crashPose(runPose(0.2), 1) }];
  }, []);
  const cols = poses.length;
  const cellW = Math.max(90, width / cols);
  const cellH = cellW * 1.45;
  const H = cellH * CHARACTERS.length;
  const picture = useMemo<SkPicture>(() => {
    const rec = Skia.PictureRecorder();
    const c = rec.beginRecording(Skia.XYWHRect(0, 0, cellW * cols, H));
    const bg = Skia.Paint();
    bg.setColor(Skia.Color(colors.surfaceSecondary));
    c.drawRect(Skia.XYWHRect(0, 0, cellW * cols, H), bg);
    const shadow = Skia.Paint();
    shadow.setColor(Skia.Color("rgba(0,0,0,0.35)"));
    CHARACTERS.forEach((ch, r) => {
      const painter = new RigPainter(ch.rig!);
      poses.forEach((p, i) => {
        const x = cellW * i + cellW / 2;
        const y = cellH * (r + 1) - cellH * 0.1;
        c.drawOval(Skia.XYWHRect(x - cellW * 0.3, y - 4, cellW * 0.6, 8), shadow);
        c.save();
        c.translate(x, y);
        painter.draw(c, solve(p.pose), cellH * 0.42);
        c.restore();
      });
    });
    return rec.finishRecordingAsPicture();
  }, [poses, cellW, cellH, cols, H]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="dev-rig-sheet">
      <ScrollView horizontal>
        <Canvas style={{ width: cellW * cols, height: H }}>
          <Picture picture={picture} />
        </Canvas>
      </ScrollView>
    </View>
  );
}
