// --- Supabase setup ---------------------------------------------------
  // Fill these in from Project Settings → API in your Supabase dashboard.
  const SUPABASE_URL = 'https://xehbsvnmlyhvxiwconne.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlaGJzdm5tbHlodnhpd2Nvbm5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNzE2MTcsImV4cCI6MjEwMDg0NzYxN30.NzhIz731aAPX1rmAsgsDw8U1KLwo1RN-WIlivCgsndo';

  const supabaseClient = (SUPABASE_URL.startsWith('https://YOUR') || !window.supabase)
    ? null
    : window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let sessionId = null;

  async function ensureSession(){
    if(sessionId || !supabaseClient) return sessionId;
    const { data, error } = await supabaseClient
      .from('kira_sessions')
      .insert({ user_agent: navigator.userAgent })
      .select('id')
      .single();
    if(error){ console.error('session insert failed', error); return null; }
    sessionId = data.id;
    return sessionId;
  }

  async function logEvent(permission, status, detail){
    if(!supabaseClient) return; // no backend configured yet — UI still works standalone
    const sid = await ensureSession();
    if(!sid) return;
    const { error } = await supabaseClient
      .from('kira_permission_events')
      .insert({ session_id: sid, permission, status, detail: detail || null });
    if(error) console.error('event insert failed', error);
  }

  async function logConsent(privacyAck, permissionsAck, agree){
    if(!supabaseClient) return;
    const sid = await ensureSession();
    if(!sid) return;
    const { error } = await supabaseClient
      .from('kira_consents')
      .insert({ session_id: sid, privacy_ack: privacyAck, permissions_ack: permissionsAck, agree });
    if(error) console.error('consent insert failed', error);
  }
  // ------------------------------------------------------------------------

  const state = {
    location: 'unrequested',
    camera: 'unrequested',
    mic: 'unrequested',
    notif: 'unrequested',
    files: 'unrequested'
  };

  function setState(key, value, detailText){
    state[key] = value;
    const row = document.getElementById('row-' + key);
    const stateEl = document.getElementById('state-' + key);
    const detailEl = document.getElementById('detail-' + key);

    row.classList.remove('granted','denied');
    stateEl.classList.remove('granted','denied','pending');

    const labelMap = {
      granted: 'Granted',
      denied: 'Denied',
      pending: 'Pending…',
      unrequested: 'Not requested'
    };
    stateEl.textContent = labelMap[value] || value;

    if(value === 'granted'){ row.classList.add('granted'); stateEl.classList.add('granted'); }
    if(value === 'denied'){ row.classList.add('denied'); stateEl.classList.add('denied'); }
    if(value === 'pending'){ stateEl.classList.add('pending'); }

    if(detailText){
      detailEl.textContent = detailText;
      detailEl.classList.add('show');
    }

    updateCount();
  }

  function updateCount(){
    const total = Object.values(state).filter(v => v === 'granted').length;
    document.getElementById('grantedCount').textContent = total + ' / 5 active';
  }

  // --- Location ---
  document.getElementById('btn-location').addEventListener('click', () => {
    if(!navigator.geolocation){
      setState('location', 'denied', 'Geolocation API not available in this browser.');
      return;
    }
    setState('location', 'pending');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const detail = `lat: ${pos.coords.latitude.toFixed(4)}, lng: ${pos.coords.longitude.toFixed(4)}\naccuracy: ±${Math.round(pos.coords.accuracy)}m`;
        setState('location', 'granted', detail);
        logEvent('location', 'granted', detail);
      },
      (err) => {
        const detail = `code ${err.code}: ${err.message}`;
        setState('location', 'denied', detail);
        logEvent('location', 'denied', detail);
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  });

  // --- Camera ---
  document.getElementById('btn-camera').addEventListener('click', async () => {
    setState('camera', 'pending');
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings ? track.getSettings() : {};
      const detail = `device: ${track.label || 'camera'}\n${settings.width || '?'}x${settings.height || '?'}`;
      setState('camera', 'granted', detail);
      logEvent('camera', 'granted', detail);
      stream.getTracks().forEach(t => t.stop());
    }catch(err){
      const detail = `${err.name}: ${err.message}`;
      setState('camera', 'denied', detail);
      logEvent('camera', 'denied', detail);
    }
  });

  // --- Microphone ---
  document.getElementById('btn-mic').addEventListener('click', async () => {
    setState('mic', 'pending');
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = stream.getAudioTracks()[0];
      const detail = `device: ${track.label || 'microphone'}`;
      setState('mic', 'granted', detail);
      logEvent('mic', 'granted', detail);
      stream.getTracks().forEach(t => t.stop());
    }catch(err){
      const detail = `${err.name}: ${err.message}`;
      setState('mic', 'denied', detail);
      logEvent('mic', 'denied', detail);
    }
  });

  // --- Notifications ---
  document.getElementById('btn-notif').addEventListener('click', async () => {
    if(!('Notification' in window)){
      setState('notif', 'denied', 'Notification API not available in this browser.');
      return;
    }
    setState('notif', 'pending');
    try{
      const result = await Notification.requestPermission();
      const status = result === 'granted' ? 'granted' : 'denied';
      const detail = `permission: ${result}`;
      setState('notif', status, detail);
      logEvent('notif', status, detail);
    }catch(err){
      setState('notif', 'denied', String(err));
      logEvent('notif', 'denied', String(err));
    }
  });

  // --- Files ---
  const fileInput = document.getElementById('fileInput');
  document.getElementById('btn-files').addEventListener('click', () => {
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    if(fileInput.files.length > 0){
      const f = fileInput.files[0];
      const detail = `name: ${f.name}\ntype: ${f.type || 'unknown'}\nsize: ${(f.size/1024).toFixed(1)} KB`;
      setState('files', 'granted', detail);
      logEvent('files', 'granted', detail);
      document.getElementById('fileName').textContent = '→ ' + f.name;
    } else {
      setState('files', 'denied', 'No file selected.');
      logEvent('files', 'denied', 'No file selected.');
    }
  });

  // --- Agreement gating ---
  const boxes = ['c1','c2','c3'].map(id => document.getElementById(id));
  const continueBtn = document.getElementById('continueBtn');
  const continueHint = document.getElementById('continueHint');

  function refreshContinue(){
    const allChecked = boxes.every(b => b.checked);
    continueBtn.disabled = !allChecked;
    continueHint.textContent = allChecked ? 'ready' : 'check all three to continue';
  }
  boxes.forEach(b => b.addEventListener('change', refreshContinue));

  continueBtn.addEventListener('click', () => {
    logConsent(boxes[0].checked, boxes[1].checked, boxes[2].checked);
    document.getElementById('grantedPanel').classList.add('show');
    continueBtn.disabled = true;
    continueBtn.textContent = 'Continued ✓';
    document.getElementById('grantedPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
