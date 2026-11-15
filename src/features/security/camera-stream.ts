// mountCameraStream: puts a camera's live view in a container: Home Assistant's own player when the frontend has loaded it, else the MJPEG proxy.
// Pattern: a mount function returning a disposable handle, after Weather's `mountRadar`: the player is a custom element of Home Assistant's
// frontend, created by hand in a box Lit binds nothing in (ADR 0016), and it takes the raw `hass`: the one place a feature hands it onward.
// Must not: read the store or an entity, word anything but what it is given, or touch the box after `destroy`.
import type {HassEntity, PanelHass} from '../../core/hass.ts';
import {isAvailable} from '../../core/states.ts';

const PLAYER = 'ha-camera-stream';

export interface CameraStreamOptions {
  /** What the player reads: Home Assistant's own element wants the whole object, which is why this is the one place a feature passes it on. */
  hass: PanelHass | null;
  /** The camera's raw state, read when the sheet opened; undefined when Home Assistant has none. */
  stateObj: HassEntity | undefined;
  /** The proxy image's text for a screen reader, in the panel's language ("Porch live"). */
  alt: string;
  /** The one line shown when the camera is offline. */
  offline: string;
}

export interface CameraStreamMount {
  destroy(): void;
}

/** The player's properties, as Home Assistant's frontend sets them on its own camera cards. */
interface CameraPlayer extends HTMLElement {
  hass: PanelHass | null;
  stateObj: HassEntity;
  muted: boolean;
  controls: boolean;
  allowExoPlayer: boolean;
}

/** Shows the view in `box`, replacing what it holds; `destroy` takes it out, which ends the stream (the image's request, the player's session). */
export function mountCameraStream(
  box: HTMLElement,
  {hass, stateObj, alt, offline}: CameraStreamOptions,
): CameraStreamMount {
  let view: HTMLElement | null;
  if (!isAvailable(stateObj)) {
    view = document.createElement('p');
    view.textContent = offline;
  } else if (customElements.get(PLAYER)) {
    const player = document.createElement(PLAYER) as CameraPlayer;
    player.hass = hass;
    player.stateObj = stateObj;
    player.muted = true;
    player.controls = true;
    player.allowExoPlayer = true;
    view = player;
  } else {
    const image = document.createElement('img');
    image.alt = alt;
    image.src = `/api/camera_proxy_stream/${stateObj.entity_id}?token=${encodeURIComponent(String(stateObj.attributes.access_token ?? ''))}`;
    view = image;
  }
  box.replaceChildren(view);
  return {
    destroy() {
      // a removed image may keep its connection to the stream open until it is collected: emptying its source ends the request
      if (view instanceof HTMLImageElement) view.removeAttribute('src');
      view?.remove();
      view = null;
    },
  };
}
