// The icon and the colour token of the Automations subject, written once for its descriptor, its pane's header and its flow's sheet.
// Pattern: a named constant, so the three never drift apart (the descriptor cannot be imported by the pane, which it imports).
// Must not: hold anything but the two, or be imported by the shell (it reads the descriptor).
import type {IconName} from '../../ui/icons.ts';

export const AUTOMATIONS_ICON: IconName = 'flow';
export const AUTOMATIONS_COLOR = 'var(--c-heat)';
