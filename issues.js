function setStatus(msg) {
  let status = document.getElementById('status');
  status.innerText = msg;
}

var sortKey = 'id';
function sort(k) {
  k = k || sortKey;
  if (k === 'id') {
    issues.sort((x, y) => x.number - y.number);
    setStatus('sorted by ID');
  } else if (k === 'recent') {
    issues.sort((x, y) => Date.parse(y.updated_at) - Date.parse(x.updated_at));
    setStatus('sorted by last modified');
  } else {
    setStatus('no idea how to sort like that');
    return;
  }
  sortKey = k;
}

function getNext(response) {
  const link = response.headers.get('link');
  if (!link) {
    return;
  }

  const m = link.match(/^<([^>]*)>\s*;[^,]*rel="?next"?/);
  if (!m) {
    return;
  }
  return m[1];
}

function buildUrl(wg, repo, type) {
  if (wg && repo) {
    console.log(`loading remote ${type} for ${wg}/${repo}`);
    return `https://api.github.com/repos/${wg}/${repo}/${type}?state=all`;
  }
  return `${type}.json`;
}

async function getAll(url) {
  let records = [];
  do {
    const response = await fetch(url);
    if (Math.floor(response.status / 100) !== 2) {
      throw new Error(`Error loading <${url}>: ${response.status}`);
    }
    records = records.concat(await response.json());
    url = getNext(response);
  } while (url);
  return records;
}

var issues;
var pulls;

async function get(wg, repo) {
  issues = null;
  pulls = null;
  [issues, pulls] = await Promise.all(
    ['issues', 'pulls'].map(type => getAll(buildUrl(wg, repo, type))));
  issues.forEach(issue => {
    if (issue.pull_request) {
      let pull = window.pulls.find(x => x.url == issue.pull_request.url);
      if (pull) {
        issue.pull_request = pull;
      }
    }
  });
  sort();
  console.log('loaded all issues and pulls');
}

var issueFilters = {
  assigned: {
    args: [],
    h: 'has an assignee',
    f: issue => issue.assignees.length > 0,
  },

  assigned_to: {
    args: ['string'],
    h: 'assigned to a specific user',
    f: login => issue => issue.assignees.some(assignee => assignee.login === login),
  },

  created_by: {
    args: ['string'],
    h: 'created by a specific user',
    f: login => issue => issue.user.login === login,
  },

  closed: {
    args: [],
    h: 'is closed',
    f: issue => issue.closed_at,
  },

  open: {
    args: [],
    h: 'is open',
    f: issue => !issue.closed_at,
  },

  merged: {
    args: [],
    h: 'a merged pull request',
    f: issue => issue.pull_request && issue.pull_request.merged_at,
  },

  discarded: {
    args: [],
    h: 'a discarded pull request',
    f: issue => issue.pull_request && !issue.pull_request.merged_at && issue.closed_at
  },

  n: {
    args: ['integer'],
    h: 'issue by number',
    f: i => issue => issue.number === i,
  },

  label: {
    args: ['string'],
    h: 'has a specific label',
    f: name => issue => issue.labels.some(label => label.name === name),
  },

  labelled: {
    args: [],
    h: 'has any label',
    f: issue => issue.labels.length > 0,
  },

  title: {
    args: ['string'],
    h: 'search title with a regular expression',
    f: function(re) {
      re = new RegExp(re);
      return issue => issue.title.match(re);
    }
  },

  body: {
    args: ['string'],
    h: 'search body with a regular expression',
    f: function(re) {
      re = new RegExp(re);
      return issue => issue.body.match(re);
    }
  },

  text: {
    args: ['string'],
    h: 'search title and body with a regular expression',
    f: function(re) {
      re = new RegExp(re);
      return issue => issue.title.match(re) || issue.body.match(re);
    }
  },

  pr: {
    args: [],
    h: 'is a pull request',
    f: issue => issue.pull_request,
  },

  issue: {
    args: [],
    h: 'is a plain issue, i.e., not(pr)',
    f: function(issue) {
      return !issue.pull_request;
    }
  },

  or: {
    args: ['filter', '...filter'],
    h: 'union',
    f: (...filters) =>  x => filters.some(filter => filter(x)),
  },

  and: {
    args: ['filter', '...filter'],
    h: 'intersection',
    f: (...filters) => x => filters.every(filter => filter(x)),
  },


  xor: {
    args: ['filter', '...filter'],
    h: 'for the insane',
    f: (...filters) =>
      x => filters.slice(1).reduce((a, filter) => a ^ filter(x), filters[0](x)),
  },

  not: {
    args: ['filter'],
    h: 'exclusion',
    f: a => issue => !a(issue),
  },

  closed_since: {
    args: ['date'],
    h: 'issues closed since the date and time',
    f: since => issue => Date.parse(issue.closed_at) >= since,
  },

  updated_since: {
    args: ['date'],
    h: 'issues updated since the date and time',
    f: since => issue => Date.parse(issue.updated_at) >= since,
  }
};

class Parser {
  constructor(s) {
    this.str = s;
    this.skipws();
  }

  skipws() {
    this.str = this.str.trimLeft();
  }

  jump(idx) {
    this.str = this.str.slice(idx);
    this.skipws();
  }

  get next() {
    return this.str.charAt(0);
  }

  parseName() {
    let m = this.str.match(/^[a-zA-Z](?:[a-zA-Z0-9_-]*[a-zA-Z0-9])?/);
    if (!m) {
      return;
    }

    this.jump(m[0].length);
    return m[0];
  }

  parseSeparator(separator) {
    if (this.next !== separator) {
      throw new Error(`Expecting separator ${separator}`);
    }
    this.jump(1);
  }

  parseString() {
    let end = -1;
    for (let i = 0; i < this.str.length; ++i) {
      let v = this.str.charAt(i);
      if (v === ')' || v === ',') {
        end = i;
        break;
      }
    }
    if (end < 0) {
      throw new Error(`Unterminated string`);
    }
    let s = this.str.slice(0, end).trim();
    this.jump(end);
    return s;
  }

  parseDate() {
    let str = this.parseString();
    let time = Date.parse(str);
    if (isNaN(time)) {
      throw new Error(`not a valid date: ${str}`);
    }
    return time;
  }

  parseNumber() {
    let m = this.str.match(/^\d+/);
    if (!m) {
      return;
    }
    this.jump(m[0].length);
    return parseInt(m[0], 10);
  }

  parseFilter() {
    let name = this.parseName();
    if (!name) {
      let n = this.parseNumber();
      if (!isNaN(n)) {
        return issueFilters.n.f.call(null, n);
      }
      return;
    }
    let f = issueFilters[name];
    if (!f) {
      throw new Error(`Unknown filter: ${name}`);
    }
    if (f.args.length === 0) {
      return f.f;
    }
    let args = [];
    for (let i = 0; i < f.args.length; ++i) {
      let arg = f.args[i];
      let ellipsis = arg.slice(0, 3) === '...';
      if (ellipsis) {
        arg = arg.slice(3);
      }

      this.parseSeparator((i === 0) ? '(' : ',');
      if (arg === 'string') {
        args.push(this.parseString());
      } else if (arg === 'date') {
        args.push(this.parseDate());
      } else if (arg === 'integer') {
        args.push(this.parseNumber());
      } else if (arg === 'filter') {
        args.push(this.parseFilter());
      } else {
        throw new Error(`Error in filter ${name} definition`);
      }
      if (ellipsis && this.next === ',') {
        --i;
      }
    }
    this.parseSeparator(')');
    return f.f.apply(null, args);
  }
}

var subset = [];
function filterIssues(str) {
  subset = issues;
  let parser = new Parser(str);
  let f = parser.parseFilter();
  while (f) {
    subset = subset.filter(f);
    f = parser.parseFilter();
  }
}

var formatter = {
  brief: x => `* ${x.title} (#${x.number})`,
  md: x => `* [#${x.number}](${x.html_url}): ${x.title}`,
};

function format(set, f) {
  return (set || subset).map(f || formatter.brief).join('\n');
}

var debounces = {};
var debounceSlowdown = 100;
function measureSlowdown() {
  let start = Date.now();
  window.setTimeout(_ => {
    let diff = Date.now() - start;
    if (diff > debounceSlowdown) {
      console.log(`slowed to ${diff} ms`);
      debounceSlowdown = Math.min(1000, diff + debounceSlowdown / 2);
    }
  }, 0);
}
function debounce(f) {
  let r = now => {
    measureSlowdown();
    f(now);
  };
  return e => {
    if (debounces[f.name]) {
      window.clearTimeout(debounces[f.name]);
      delete debounces[f.name];
    }
    if (e.key === "Enter") {
      r(true);
    } else {
      debounces[f.name] = window.setTimeout(_ => {
        delete debounces[f.name];
        r(false)
      }, 10 + debounceSlowdown);
    }
  }
}

function makeRow(issue) {
  function cellID() {
    let td = document.createElement('td');
    td.className = 'id';
    let a = document.createElement('a');
    a.href = issue.html_url;
    a.innerText = issue.number;
    td.appendChild(a);
    return td;
  }

  function cellTitle() {
    let td = document.createElement('td');
    let div = document.createElement('div');
    div.innerText = issue.title;
    div.onclick = e => e.target.parentNode.classList.toggle('active');
    div.style.cursor = 'pointer';
    td.appendChild(div);
    div = document.createElement('div');
    div.innerText = issue.body;
    div.className = 'extra';
    td.appendChild(div);
    return td;
  }

  function addUser(td, user, short) {
    let image = document.createElement('img');
    image.src = user.avatar_url + '&s=32';
    image.width = 16;
    image.height = 16;
    td.appendChild(image);
    let a = document.createElement('a');
    a.href = user.html_url;
    a.innerText = user.login;
    if (short) {
      a.classList.add('short');
    }
    td.appendChild(a);
  }

  function cellUser() {
    let td = document.createElement('td');
    td.className = 'user';
    addUser(td, issue.user);
    return td;
  }

  function cellAssignees() {
    let td = document.createElement('td');
    td.className = 'user';
    if (issue.assignees) {
      issue.assignees.forEach(user => addUser(td, user, issue.assignees.length > 1));
    }
    return td;
  }

  function cellState() {
    let td = document.createElement('td');
    if (issue.pull_request) {
      if (issue.pull_request.merged_at) {
        td.innerText = 'merged';
      } else if (issue.pull_request.closed_at) {
        td.innerText = 'discarded';
      } else {
        td.innerText = 'pr';
      }
    } else {
      td.innerText = issue.state;
    }
    return td;
  }

  function cellLabels() {
    let td = document.createElement('td');
    td.className = 'label';
    issue.labels.forEach(label => {
      let sp = document.createElement('span');
      sp.style.backgroundColor = '#' + label.color;
      sp.innerText = label.name;
      td.appendChild(sp);
    });
    return td;
  }

  let tr = document.createElement('tr');
  tr.appendChild(cellID());
  tr.appendChild(cellTitle());
  tr.appendChild(cellState());
  tr.appendChild(cellUser());
  tr.appendChild(cellAssignees());
  tr.appendChild(cellLabels());
  return tr;
}

function show(issues) {
  if (!issues) {
    return;
  }

  let tbody = document.getElementById('tbody');
  tbody.innerHTML = '';
  issues.forEach(issue => {
    tbody.appendChild(makeRow(issue));
  });
}

var currentFilter = '';
function filter(str, now) {
  try {
    filterIssues(str);
    setStatus(`${issues.length} records selected`);
    if (now) {
      window.location.hash = str;
      currentFilter = str;
    }
  } catch (e) {
    if (now) { // Only show errors when someone hits enter.
      setStatus(`Error: ${e.message}`);
      console.log(e);
    }
  }
}

function slashCmd(cmd) {
  if (cmd[0] === 'help') {
    setStatus('help shown');
    document.getElementById('help').classList.remove('hidden');
  } else if (cmd[0] === 'local') {
    setStatus('retrieving local JSON files');
    get().then(redraw);
  } else if (cmd[0] === 'remote') {
    if (cmd.length < 3) {
      setStatus('need to specify github repo');
    } else {
      get(cmd[1], cmd[2]).then(redraw)
        .then(
          _ => status.innerText = `successfully loaded ${cmd[1]}/${cmd[2]} from GitHub`,
          e => status.innerText = `Error: ${e.message}`);
      setStatus(`fetching from GitHub for ${cmd[1]}/${cmd[2]}`);
    }
  } else if (cmd[0]  === 'sort') {
    sort(cmd[1]);
    show(subset);
  } else {
    setStatus('unknown command: /' + cmd.join(' '));
  }
}

function redraw(now) {
  let cmd = document.getElementById('cmd');
  if (cmd.value.charAt(0) == '/') {
    if (now) {
      slashCmd(cmd.value.slice(1).split(' ').map(x => x.trim()));
      cmd.value = currentFilter;
      document.getElementById('display').classList.add('hidden');
    }
    return;
  }

  if (!issues) {
    if (now) {
      showStatus('Still loading...');
    }
    return;
  }

  document.getElementById('help').classList.add('hidden');
  document.getElementById('display').classList.remove('hidden');
  filter(cmd.value, now);
  show(subset);
}

function generateHelp() {
  let functionhelp = document.getElementById('functions');
  Object.keys(issueFilters).forEach(k => {
    let li = document.createElement('li');
    let arglist = '';
    if (issueFilters[k].args.length > 0) {
      arglist = '(' + issueFilters[k].args.map(x => '<' + x + '>').join(', ') + ')';
    }
    let help = '';
    if (issueFilters[k].h) {
      help = ' - ' + issueFilters[k].h;
    }
    li.innerText = `${k}${arglist}${help}`;
    functionhelp.appendChild(li);
  });
}

window.onload = () => {
  let cmd = document.getElementById('cmd');
  cmd.onkeypress = debounce(redraw);
  if (window.location.hash) {
    cmd.value = decodeURIComponent(window.location.hash.substring(1));
  }
  generateHelp();
  get().then(redraw);
}
