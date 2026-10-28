/* Original project Python generator, retained as a reference preview only. Run uses Web Serial. */
const workspace=window.codyWorkspace;
const dynamicBlockSpecs=new Map(window.HARDWARE_SPECS.map(s=>[s.type,s]));
const SpritePrototype={value:()=>null,statement:()=>null};

const ExecutionTarget={programBlocks:ws=>ws.getAllBlocks(false).filter(b=>dynamicBlockSpecs.has(b.type)),initialization:()=> 'cody = CN()'};
function quotePython(value) {
  return JSON.stringify(String(value ?? ''));
}

function safeName(name) {
  return String(name || 'variable')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^[^A-Za-z_]+/, '') || 'variable';
}

function variableName(block, fieldName) {
  const id = block.getFieldValue(fieldName);
  const variable = block.workspace.getVariableMap().getVariableById(id);
  return safeName(variable ? variable.name : id);
}

function fieldPythonValue(arg, value) {
  if (arg.kind === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : '0';
  }

  if (arg.kind === 'dropdown') {
    return String(value);
  }

  if (arg.kind === 'colour') {
    return quotePython(value);
  }

  return quotePython(value);
}

function blockFieldValue(block, arg) {
  return block.getFieldValue(arg.name);
}

function indent(code, spaces = 4) {
  const pad = ' '.repeat(spaces);
  const lines = String(code || '').split('\n');
  const out = lines
    .filter(line => line.length > 0)
    .map(line => pad + line)
    .join('\n');
  return out ? out + '\n' : '';
}

function statementToCode(block, inputName) {
  const target = block.getInputTargetBlock(inputName);
  return stackToCode(target);
}

function valueToCode(block, inputName, fallback = 'None') {
  const target = block.getInputTargetBlock(inputName);
  if (!target) return fallback;
  return blockToPythonValue(target);
}

function stackToCode(block) {
  let code = '';
  let cursor = block;

  while (cursor) {
    code += blockToPythonStatement(cursor);
    cursor = cursor.getNextBlock();
  }

  return code;
}

function blockToPythonValue(block) {
  if (!block) return 'None';
  const spriteValue = SpritePrototype.value(block);
  if (spriteValue !== null) return spriteValue;
  if (block.type === 'cn_timer_value') return '(time.monotonic() - _codynick_timer_start)';

  if (dynamicBlockSpecs.has(block.type)) {
    return renderDynamicBlock(block);
  }

  switch (block.type) {
    case 'math_number':
      return String(Number(block.getFieldValue('NUM') || 0));

    case 'text':
      return quotePython(block.getFieldValue('TEXT') || '');

    case 'logic_boolean':
      return block.getFieldValue('BOOL') === 'TRUE' ? 'True' : 'False';

    case 'logic_negate':
      return '(not ' + valueToCode(block, 'BOOL', 'False') + ')';

    case 'logic_operation': {
      const op = block.getFieldValue('OP') === 'AND' ? 'and' : 'or';
      return '(' + valueToCode(block, 'A', 'False') + ' ' + op + ' ' + valueToCode(block, 'B', 'False') + ')';
    }

    case 'logic_compare': {
      const opMap = { EQ: '==', NEQ: '!=', LT: '<', LTE: '<=', GT: '>', GTE: '>=' };
      const op = opMap[block.getFieldValue('OP')] || '==';
      return '(' + valueToCode(block, 'A', '0') + ' ' + op + ' ' + valueToCode(block, 'B', '0') + ')';
    }

    case 'math_arithmetic': {
      const opMap = { ADD: '+', MINUS: '-', MULTIPLY: '*', DIVIDE: '/', POWER: '**' };
      const op = opMap[block.getFieldValue('OP')] || '+';
      return '(' + valueToCode(block, 'A', '0') + ' ' + op + ' ' + valueToCode(block, 'B', '0') + ')';
    }

    case 'math_single': {
      const op = block.getFieldValue('OP');
      const n = valueToCode(block, 'NUM', '0');
      if (op === 'NEG') return '(-' + n + ')';
      if (op === 'ABS') return 'abs(' + n + ')';
      if (op === 'ROOT') return '(' + n + ' ** 0.5)';
      return n;
    }

    case 'math_round': {
      const op = block.getFieldValue('OP');
      const n = valueToCode(block, 'NUM', '0');
      if (op === 'ROUND') return 'round(' + n + ')';
      if (op === 'ROUNDUP') return '__import__("math").ceil(' + n + ')';
      if (op === 'ROUNDDOWN') return '__import__("math").floor(' + n + ')';
      return 'round(' + n + ')';
    }

    case 'math_random_int':
      return '__import__("random").randint(int(' + valueToCode(block, 'FROM', '1') + '), int(' + valueToCode(block, 'TO', '10') + '))';

    case 'variables_get':
      return variableName(block, 'VAR');

    case 'text_join': {
      const itemCount = block.itemCount_ || 2;
      const parts = [];
      for (let i = 0; i < itemCount; i++) {
        parts.push('str(' + valueToCode(block, 'ADD' + i, "''") + ')');
      }
      return '(' + parts.join(' + ') + ')';
    }

    default:
      return 'None';
  }
}

function blockToPythonStatement(block) {
  if (!block) return '';
  const dashboardStatement = DashboardBlocks.statement(block, valueToCode);
  if (dashboardStatement !== null) return dashboardStatement;
  const spriteStatement = SpritePrototype.statement(block, valueToCode);
  if (spriteStatement !== null) return spriteStatement;
  if (block.type === 'cn_timer_reset') return '_codynick_timer_start = time.monotonic()\n';

  if (dynamicBlockSpecs.has(block.type)) {
    const spec = dynamicBlockSpecs.get(block.type);
    const expr = renderDynamicBlock(block);
    if (spec.output) {
      return expr + '\n';
    }
    return expr + '\n';
  }

  switch (block.type) {
    case 'text_print':
      return 'print(' + valueToCode(block, 'TEXT', "''") + ')\n';

    case 'cn_wait':
      return 'time.sleep(max(0, ' + valueToCode(block, 'SECONDS', '1') + '))\n';

    case 'cn_forever':
      return 'while True:\n' + indent(statementToCode(block, 'DO') + 'time.sleep(0.01)\n');

    case 'variables_set':
      return variableName(block, 'VAR') + ' = ' + valueToCode(block, 'VALUE', 'None') + '\n';

    case 'controls_if': {
      let code = '';
      const ifCount = 1 + (block.elseifCount_ || 0);
      for (let i = 0; i < ifCount; i++) {
        const keyword = i === 0 ? 'if' : 'elif';
        const condition = valueToCode(block, 'IF' + i, 'False');
        const body = statementToCode(block, 'DO' + i) || 'pass\n';
        code += keyword + ' ' + condition + ':\n' + indent(body);
      }
      if (block.elseCount_) {
        const body = statementToCode(block, 'ELSE') || 'pass\n';
        code += 'else:\n' + indent(body);
      }
      return code;
    }

    case 'controls_repeat_ext': {
      const times = valueToCode(block, 'TIMES', '10');
      const body = statementToCode(block, 'DO') || 'pass\n';
      return 'for _ in range(int(' + times + ')):\n' + indent(body);
    }

    case 'controls_whileUntil': {
      const until = block.getFieldValue('MODE') === 'UNTIL';
      const cond = valueToCode(block, 'BOOL', 'False');
      const body = statementToCode(block, 'DO') || 'pass\n';
      return 'while ' + (until ? '(not ' + cond + ')' : cond) + ':\n' + indent(body + 'time.sleep(0.01)\n');
    }

    case 'controls_flow_statements':
      return block.getFieldValue('FLOW') === 'BREAK' ? 'break\n' : 'continue\n';

    case 'cn_event_start':
    case 'cn_event_loop':
      return statementToCode(block, 'DO');

    default:
      return '# Unsupported statement block: ' + block.type + '\n';
  }
}

function renderDynamicBlock(block) {
  const spec = dynamicBlockSpecs.get(block.type);
  let code = String(spec.python || '');

  for (const arg of (spec.args || [])) {
    if (arg.kind === 'value') {
      code = code.replaceAll('{' + arg.name + '}', valueToCode(block, arg.name, '0'));
      continue;
    }
    const raw = blockFieldValue(block, arg);
    const value = fieldPythonValue(arg, raw);
    code = code.replaceAll('{' + arg.name + '}', value);
  }

  return code;
}

function generatePython() {
  const allBlocks = workspace.getAllBlocks(false);
  const usesStage = allBlocks.some(block => block.type.startsWith('sprite_'));
  const topBlocks = workspace.getTopBlocks(true);
  const startBlocks = topBlocks.filter(b => b.type === 'cn_event_start');
  const loopBlocks = topBlocks.filter(b => b.type === 'cn_event_loop');
  const gadgetBlocks = ExecutionTarget.programBlocks(workspace, dynamicBlockSpecs);
  const usesHardware = gadgetBlocks.length > 0;
  const usesDashboard = [...startBlocks, ...loopBlocks].some(root => root.getDescendants(false).some(block => block.type.startsWith('dash_')));

  let startCode = '';
  for (const b of startBlocks) {
    startCode += statementToCode(b, 'DO');
  }

  let loopCode = '';
  for (const b of loopBlocks) {
    loopCode += statementToCode(b, 'DO');
  }

  if (!startCode.trim()) startCode = 'pass\n';
  if (!loopCode.trim()) loopCode = 'time.sleep(0.05)\n';
  else loopCode += 'time.sleep(0.05)\n';

  return [
    '# Auto-generated by CodyNick Blockly IDE',
    '# Reference preview only. The Run button executes blocks in this browser using Web Serial.',
    '# Do not edit manually if you plan to regenerate it from blocks.',
    '',
    'import time',
    usesDashboard ? DashboardBlocks.initialization() : '',
    'from CodyNick import *',
    usesStage ? 'from SpriteStage import SpriteStage' : '',
    '',
    '_codynick_timer_start = time.monotonic()',
    usesStage ? SpritePrototype.initialization() : '',
    usesHardware ? ExecutionTarget.initialization(gadgetBlocks) : 'cody = None',
    '',
    'try:',
    indent('# When CodyNick starts'),
    indent(startCode),
    indent('# Main Loop'),
    indent('while True:\n' + indent(loopCode)),
    'except KeyboardInterrupt:',
    '    pass',
    'finally:',
    '    try:',
    '        cody.close()',
    '    except Exception:',
    '        pass',
    ''
  ].join('\n');
}

function viewPython() {
  const mixed=workspace.getAllBlocks(false).some(b=>b.getFieldValue('TARGET')==='SIMULATION'||b.type.startsWith('dash_'));
  const code = mixed?'# This Live program uses browser simulation/dashboard targets.\n# A single Python hardware script cannot represent its routing.\n# Run the blocks using the Live runtime.':updatePythonPreview(true);
  document.getElementById('pythonPreview').textContent = code;
  document.getElementById('pythonModal').classList.add('open');
}

function closePythonModal(event) {
  if (event) {
    event.stopPropagation();
    const modal = document.querySelector('#pythonModal .modal');
    const clickedBackdrop = event.target && event.target.id === 'pythonModal';
    const clickedButton = event.target && event.target.closest('button');
    if (modal && modal.contains(event.target) && !clickedButton) return;
    if (!clickedBackdrop && !clickedButton) return;
  }
  document.getElementById('pythonModal').classList.remove('open');
}

async function copyPythonPreview(event) {
  if (event) event.stopPropagation();
  const code = document.getElementById('pythonPreview').textContent;
  await navigator.clipboard.writeText(code);
  window.portalToast?.('Python copied.');
}


function updatePythonPreview(){return generatePython();}
