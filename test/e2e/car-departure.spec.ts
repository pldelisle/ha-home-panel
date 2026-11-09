// The departure schedule's time field (Car sheet): clearing it, as the clock icon's "Clear" does on a phone, must not stop
// the sheet from drawing (it redraws every second while the sheet is open).
import {test, expect, tabletOnly} from './fixtures';
import {FULL_CFG} from './houses';

test.use({houseOpts: {cfg: FULL_CFG}});

test('a cleared departure time leaves the description without a time and the sheet alive', async ({house}) => {
  tabletOnly();
  await house.tab('car');
  const sheet = house.root().locator('#car-comfort');
  const description = sheet.locator('.tgl .tx span', {hasText: 'saved'});
  await sheet.locator('#deptime').fill('');
  await expect(description).toHaveText('Off · no days saved');
  // still alive: a day tapped after the time was cleared is drawn
  await sheet.locator('[data-k="day"][data-d="monday"]').click();
  await expect(description).toHaveText('Off · Mon saved');
  await sheet.locator('#deptime').fill('08:30');
  await expect(description).toHaveText('Off · Mon at 8:30 am saved');
});

// What Ford sends can be malformed or incomplete; the sheet still draws, and says nothing where it cannot say a date
test('a Ford message with a malformed date and a plug-in with no plug-out time still draw', async ({house}) => {
  tabletOnly();
  await house.tab('car');
  await house.setState('sensor.fordpass_test_messages', {
    state: '2',
    attributes: {
      json_src: [
        {messageSubject: 'Service due', createdDate: 'not a date', messageBody: 'Book a visit'},
        {messageSubject: 'Tyre check', createdDate: '2026-11-06T22:00:00Z', messageBody: 'Look at the tyres'},
      ],
    },
  });
  await house.setState('sensor.fordpass_test_energytransferlogentry', {
    state: 'done',
    attributes: {plugDetails: {plugInTime: '2026-11-06T22:00:00Z'}, stateOfCharge: 80},
  });
  const ford = house.root().locator('#car-ford');
  await expect(ford).toContainText('Service due');
  await expect(ford.locator('.arow b').nth(0)).toHaveText('Service due');
  await expect(ford.locator('.arow b').nth(1)).toHaveText('Tyre check, Nov 6');
  await expect(house.root().locator('#car-last > p')).toHaveText('Nov 6, 5:00 pm to –');
});
