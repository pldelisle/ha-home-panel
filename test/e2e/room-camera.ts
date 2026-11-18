// Helper for the room-view specs that need a camera: the test house has none, so one is added to an area the way Home Assistant adds an entity.
import type {House} from './fixtures';

/** Adds `camera.porch`, a UniFi Protect camera in `areaId`, with the registry row and the state Home Assistant would give it; later `setState` calls keep the row. */
export const addPorchCamera = async (house: House, areaId: string) => {
  await house.register('camera.porch', {platform: 'unifiprotect', area_id: areaId});
  await house.setState('camera.porch', {
    state: 'idle',
    attributes: {friendly_name: 'Porch', entity_picture: '/api/camera_proxy/camera.porch?token=x', access_token: 'tok'},
  });
};
