'use strict';
const ExecutionTarget = (() => {
  const select = () => document.getElementById('executionTarget');
  function requirements(blocks) {
    const gadgets = new Set();
    for (const block of blocks) {
      const type = block.type, device = block.getFieldValue('device');
      let gadget;
      if (type.startsWith('cn_rgb_matrix_') || type.startsWith('cn_sound_')) gadget = 'cjp';
      else if (type.startsWith('cn_led_matrix_')) gadget = 'matrix';
      else if (type === 'cn_temperature_read') gadget = 'temperature';
      else if (type === 'cn_soil_read') gadget = 'soil';
      else if (type.startsWith('cn_wifi_') || type.startsWith('cn_iot_')) gadget = 'wifi';
      else if (type.startsWith('cn_joystick_')) {
        if (["'CJP'", '5'].includes(device)) gadget = 'cjp';
        else if (["'STANDALONE'", '0'].includes(device)) gadget = 'joystick';
      } else if (['cn_seven_segment_display', 'cn_seven_segment_display_value', 'cn_ultrasonic_read'].includes(type)) {
        if (["'STANDALONE'", '0'].includes(device)) gadget = type.startsWith('cn_seven_segment_') ? 'seven' : 'ultrasonic';
      } else if (type === 'cn_log') continue;
      if (!gadget) throw Error('Block ' + type + ' / device ' + (device || '') + ' is not supported in Simulator mode. Choose Hardware or remove this block.');
      gadgets.add(gadget);
    }
    return [...gadgets].sort();
  }
  function initialization(blocks) {
    if (select().value !== 'simulator') return 'cody = CN()';
    try { return 'cody = Simulator(required_gadgets=' + JSON.stringify(requirements(blocks)) + ')'; }
    catch(error) { return 'raise RuntimeError(' + JSON.stringify(error.message) + ')'; }
  }
  function programBlocks(workspace, specs) {
    const roots = workspace.getTopBlocks(true).filter(b => ['cn_event_start', 'cn_event_loop'].includes(b.type));
    return [...new Set(roots.flatMap(block => block.getDescendants(false)))].filter(block => specs.has(block.type));
  }
  async function preflight(workspace, specs) {
    if (select().value !== 'simulator') return;
    const blocks = programBlocks(workspace, specs);
    if (!blocks.length) return;
    const response = await fetch('/simulation/command', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'check_gadgets', gadgets:requirements(blocks)})});
    const result = await response.json();
    if (!response.ok) {
      const message = result.error || 'Simulator is not available.';
      if (message.startsWith('Add ')) await postJson('?api=stop', {});
      throw Error(message);
    }
  }
  function initialize() {
    Blockly.serialization.registry.register('codynick_execution', {
      priority: 6,
      save: () => ({target: select().value}),
      load: data => {select().value = data?.target === 'hardware' ? 'hardware' : 'simulator';},
      clear: () => {select().value = 'simulator';}
    });
    select().addEventListener('change', () => {updatePythonPreview(true);scheduleSave();});
  }
  return {initialize, initialization, programBlocks, preflight};
})();
