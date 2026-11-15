// The camera sources, in the order they are read: a list of one, UniFi Protect's.
// Pattern: strategy (Gamma et al.) behind a hypothetical seam by ADR 0005's reasoning: a generic `camera.*` adapter would show
// cameras the legacy panel hides, a visible change that needs its own baseline, and a list makes it a one-file addition.
// Must not: hold a rule (an adapter does), import a feature, the shell or the DOM, or add the generic adapter before its ticket.
import type {CameraSource} from './camera-source.ts';
import {protectCameras} from './unifi-protect.ts';

export const CAMERA_SOURCES: readonly CameraSource[] = [protectCameras];
