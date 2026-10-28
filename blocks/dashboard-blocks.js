'use strict';
const DashboardBlocks = (() => {
  const colour = '#147d92';
  const name = {type:'field_input',name:'NAME',text:'temperature'};
  const number = (name, value, min, max) => ({type:'field_number',name,value,min,max});
  const choice = (name, values) => ({type:'field_dropdown',name,options:values.map(value=>[value,value])});
  const specs = [
    {type:'dash_clear',message0:'clear dashboard'},
    {type:'dash_create',message0:'create widget %1 type %2 title %3',args0:[name,choice('TYPE',['info','gauge','graph']),{type:'field_input',name:'TITLE',text:'Temperature'}]},
    {type:'dash_set',message0:'set widget %1 to %2',args0:[name,{type:'input_value',name:'VALUE'}]},
    {type:'dash_append',message0:'add %1 to graph %2',args0:[{type:'input_value',name:'VALUE',check:'Number'},name]},
    {type:'dash_history',message0:'graph %1 history %2 samples',args0:[name,number('COUNT',20,1,1000)]},
    {type:'dash_range',message0:'gauge %1 minimum %2 maximum %3',args0:[name,number('MIN',0),number('MAX',50)]},
    {type:'dash_appearance',message0:'widget %1 colour %2 width %3 height %4',args0:[name,choice('COLOR',['blue','green','red','orange','purple','cyan','gray']),number('WIDTH',1,1,3),number('HEIGHT',1,1,3)]},
    {type:'dash_font',message0:'widget %1 font %2 size %3 horizontal %4 vertical %5',args0:[name,choice('FONT',['Arial','Verdana','Tahoma','Trebuchet MS','Georgia','Times New Roman','Courier New']),number('SIZE',32,8,96),choice('HORIZONTAL',['center','left','right']),choice('VERTICAL',['center','top','bottom'])]}
  ];
  for (const [kind,label] of [['info','info'],['gauge','gauge'],['graph','graph']]) {
    specs.push({type:'dash_create_'+kind,message0:`create ${label} %1 title %2`,args0:[name,{type:'field_input',name:'TITLE',text:kind==='graph'?'History':'Temperature'}]});
    if(kind!=='graph') specs.push({type:'dash_'+kind+'_set',message0:`set ${label} %1 to %2`,args0:[name,{type:'input_value',name:'VALUE',...(kind==='gauge'?{check:'Number'}:{})}]});
  }
  const folders = [
    ['Setup','#546e7a',['dash_clear','dash_appearance','dash_font']],
    ['Info','#147d92',['dash_create_info','dash_info_set']],
    ['Gauge','#29854a',['dash_create_gauge','dash_gauge_set','dash_range']],
    ['Graph','#a0528c',['dash_create_graph','dash_append','dash_history']]
  ];
  function definitions() {
    Blockly.defineBlocksWithJsonArray(specs.map(spec=>({...spec,previousStatement:null,nextStatement:null,colour:folders.find(folder=>folder[2].includes(spec.type))?.[1]||colour,
      tooltip:'Creates or updates a widget on your own dashboard. Create the named widget before updating it.'})));
  }
  function categories() {
    return folders.map(([name,colour,types])=>({kind:'category',name,colour,contents:types.map(type=>({kind:'block',type,
      ...(['dash_info_set','dash_gauge_set','dash_append'].includes(type)?{inputs:{VALUE:{shadow:{type:'math_number',fields:{NUM:25}}}}}:{})}))}));
  }
  function category() {
    return {kind:'category',name:'Dashboard',colour,contents:specs.map(spec=>({kind:'block',type:spec.type,
      ...(spec.type==='dash_set'||spec.type==='dash_append'?{inputs:{VALUE:{shadow:{type:'math_number',fields:{NUM:25}}}}}:{})}))};
  }
  function statement(block, valueToCode) {
    if(!block.type.startsWith('dash_')) return null;
    const field = key=>block.getFieldValue(key);
    const q = key=>JSON.stringify(String(field(key)));
    const n = key=>String(Number(field(key)));
    const widget=q('NAME');
    switch(block.type) {
      case 'dash_clear': return 'Dashboard.clear()\n_dashboard_widgets.clear()\n_dashboard_histories.clear()\n_dashboard_limits.clear()\n_dashboard_samples.clear()\n';
      case 'dash_create': return `_dashboard_create(${widget}, ${q('TYPE')}, ${q('TITLE')})\n`;
      case 'dash_create_info': return `_dashboard_create(${widget}, "info", ${q('TITLE')})\n`;
      case 'dash_create_gauge': return `_dashboard_create(${widget}, "gauge", ${q('TITLE')})\n`;
      case 'dash_create_graph': return `_dashboard_create(${widget}, "graph", ${q('TITLE')})\n`;
      case 'dash_info_set':
      case 'dash_gauge_set':
      case 'dash_set': return `_dashboard_get(${widget}).set(${valueToCode(block,'VALUE','0')})\n`;
      case 'dash_append': return `_dashboard_append(${widget}, ${valueToCode(block,'VALUE','0')})\n`;
      case 'dash_history': return `_dashboard_limit(${widget}, ${n('COUNT')})\n`;
      case 'dash_range': return `_dashboard_settings(${widget}, min_value=${n('MIN')}, max_value=${n('MAX')})\n`;
      case 'dash_appearance': return `_dashboard_settings(${widget}, color=${q('COLOR')}, column_span=${n('WIDTH')}, height_multiplier=${n('HEIGHT')})\n`;
      case 'dash_font': return `_dashboard_settings(${widget}, font_name=${q('FONT')}, font_size=${n('SIZE')}, horizontal_alignment=${q('HORIZONTAL')}, vertical_alignment=${q('VERTICAL')})\n`;
      default: throw Error('Unknown dashboard block: '+block.type);
    }
  }
  function initialization() {
    return `import Dashboard
import math
_dashboard_widgets = {}
_dashboard_histories = {}
_dashboard_limits = {}
_dashboard_samples = {}

def _dashboard_get(name):
    if name not in _dashboard_widgets:
        raise RuntimeError('Create dashboard widget "' + name + '" before using it.')
    return _dashboard_widgets[name]

def _dashboard_create(name, kind, title):
    if name in _dashboard_widgets:
        _dashboard_widgets[name].delete()
    appearance = dict(font_size=32, font_name='Arial', horizontal_alignment='center', vertical_alignment='center') if kind in ('info', 'gauge') else {}
    _dashboard_widgets[name] = Dashboard.Card(kind, title, value=[] if kind == 'graph' else 0, min_value=0, max_value=50, x_axis_label='Sample' if kind == 'graph' else None, auto_delete=False, **appearance)
    _dashboard_histories[name] = []
    _dashboard_limits[name] = 20
    _dashboard_samples[name] = 0

def _dashboard_settings(name, **settings):
    card = _dashboard_get(name)
    for key, value in settings.items():
        setattr(card, key, value)
    card.save()

def _dashboard_limit(name, count):
    card = _dashboard_get(name)
    if card.type != 'graph':
        raise RuntimeError('History requires a graph widget: ' + name)
    _dashboard_limits[name] = max(1, min(1000, int(count)))
    _dashboard_histories[name] = _dashboard_histories[name][-_dashboard_limits[name]:]
    card.set(_dashboard_histories[name])

def _dashboard_append(name, value):
    card = _dashboard_get(name)
    if card.type != 'graph':
        raise RuntimeError('Add sample requires a graph widget: ' + name)
    if value is None:
        return
    value = float(value)
    if not math.isfinite(value):
        return
    _dashboard_samples[name] += 1
    history = _dashboard_histories[name]
    history.append({'x': _dashboard_samples[name], 'y': value})
    del history[:-_dashboard_limits[name]]
    card.set(history)
`;
  }
  return {definitions,category,categories,statement,initialization};
})();
