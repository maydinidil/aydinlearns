// web/src/screens/MethodMapScreen.tsx: the Methodology map (design §8, §14; D13; Task C6), at #/methodology. The concepts
// under their seven topics, each with its reading and its practice. Everything is open; a state is a signal, never a gate.
// It is ChoiceMapScreen, the same map GA4 uses, grouped by topic.
import { ChoiceMapScreen } from './Ga4MapScreen.tsx';

export function MethodMapScreen() {
  return <ChoiceMapScreen section="methodology" byTopic intro="Metrics, experiments, statistics and pricing economics, grouped by topic. Everything is open: read a concept, then practise it, in any order." />;
}
