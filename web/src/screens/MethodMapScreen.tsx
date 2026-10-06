// web/src/screens/MethodMapScreen.tsx: the Methodology map (design §8, §14; D13; Task C6), at #/methodology. The ten metrics
// under their four topics, each with its reading and its practice. Everything is open; a state is a signal, never a gate.
// It is ChoiceMapScreen, the same map GA4 uses, grouped by topic.
import { ChoiceMapScreen } from './Ga4MapScreen.tsx';

export function MethodMapScreen() {
  return <ChoiceMapScreen section="methodology" byTopic intro="Ten metrics, grouped by topic. Every metric is open: read it, then practise it, in any order." />;
}
