// web/src/components/Mascot.tsx: Grondig's mole as a quiet companion (S9-21, D133). Three poses, every image decorative (alt=""), the text
// around it unchanged, no animation. It sits in the header, on Today, beside a graded result and on empty screens, never inside a timed
// run's question view. This file is the one place that builds a pose's image URL.

export type Pose = 'calm' | 'thinking' | 'pleased';
export type MascotSize = 32 | 48 | 64 | 128;

// Written out one by one so Vite fingerprints each file at build time and Node resolves it to the file in tests.
const URLS: Record<Pose, string> = {
  calm: new URL('../assets/mascot/mole-calm.png', import.meta.url).href,
  thinking: new URL('../assets/mascot/mole-thinking.png', import.meta.url).href,
  pleased: new URL('../assets/mascot/mole-pleased.png', import.meta.url).href,
};

/** The image URL of a pose. */
export const poseUrl = (pose: Pose): string => URLS[pose];

/** Today's one calm line: no streak, no missed day, no count of days. */
export const TODAY_LINE = 'Dig in when you are ready.';

export function Mascot({ pose, size }: { pose: Pose; size: MascotSize }) {
  return <img className="mascot" src={poseUrl(pose)} alt="" width={size} height={size} />;
}

/** An empty screen's line with the calm mole beside it. The line keeps its own class, so its look is unchanged. `mascot={false}` leaves the mole out where one is already on screen. */
export function EmptyLine({ text, className, mascot = true }: { text: string; className?: string; mascot?: boolean }) {
  return <div className="empty-line">{mascot && <Mascot pose="calm" size={48} />}<p className={className}>{text}</p></div>;
}
