// Helper for the room-view specs that need a camera: the test house has none, so one is added to an area the way Home Assistant adds an entity.
import type {House} from './fixtures';

/**
 * Adds `camera.porch`, a UniFi Protect camera in `areaId`, with the state and the registry row Home Assistant would give it. Call it before
 * any other `setState`: the harness hands the panel its own registries again with each of those, which drops the camera's row.
 */
export const addPorchCamera = async (house: House, areaId: string) => {
  await house.setState('camera.porch', {
    state: 'idle',
    attributes: {friendly_name: 'Porch', entity_picture: '/api/camera_proxy/camera.porch?token=x', access_token: 'tok'},
  });
  await house.page.evaluate(area => {
    const panel = (window as unknown as {panel: {hass: {entities: object}}}).panel;
    panel.hass = {
      ...panel.hass,
      entities: {
        ...panel.hass.entities,
        'camera.porch': {entity_id: 'camera.porch', platform: 'unifiprotect', area_id: area},
      },
    };
  }, areaId);
};
