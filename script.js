// merged script.js — SPA + Find Jobs filters using job-order cards
(function () {
  const STORAGE_KEY = 'tasktrail_demo_jobs_v100';
  const USER_KEY = 'tasktrail_current_user';

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    // load state
    let jobs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    let currentUser = localStorage.getItem(USER_KEY) || null;

    // --- DOM refs (guarded) ---
    const navHome = document.getElementById('navHome');
    const navFind = document.getElementById('navFind');
    const navPost = document.getElementById('navPost');
    const navOrders = document.getElementById('navOrders');
    const navProfile = document.getElementById('navProfile');

    const homeView = document.getElementById('homeView');
    const findView = document.getElementById('findView');
    const postView = document.getElementById('postView');
    const ordersView = document.getElementById('ordersView');
    const profileView = document.getElementById('profileView');

    // --- Map state for Home view ---
    let map = null;
    let userMarker = null;
    let mapInitialized = false;

    // Shared user location for distance calculations (default: UBC)
    let userLocation = { lat: 49.2606, lng: -123.2460 };

    // optional home stats
    const statOpenCount = document.getElementById('statOpenCount');

    // profile stats
    const profileJobsDoneEl = document.getElementById('profileJobsDone');
    const profileJobsPostedEl = document.getElementById('profileJobsPosted');
    const profilePhysicalPctEl = document.getElementById('profilePhysicalPct');
    const profileTutoringPctEl = document.getElementById('profileTutoringPct');
    const profilePhysicalBar = document.getElementById('profilePhysicalBar');
    const profileTutoringBar = document.getElementById('profileTutoringBar');
    const logoutBtn = document.getElementById('logoutBtn');

    // grids and forms
    const jobGrid = document.getElementById('jobGrid');
    const activeListingsEl = document.getElementById('activeListings');

    const jobForm = document.getElementById('jobForm');
    const titleEl = document.getElementById('jobTitle');
    const descEl = document.getElementById('jobDescription');
    const priceEl = document.getElementById('jobPrice');
    const locEl = document.getElementById('jobLocation');
    const catEl = document.getElementById('jobCategory');
    const postCancel = document.getElementById('postCancel');

    // Location autocomplete UI
    const locationSuggestions = document.getElementById('locationSuggestions');
    let selectedLocationCoords = null;
    let locationDebounceTimer = null;

    // --- Find Jobs (filters UI) DOM refs ---
    const jobSearchEl = document.getElementById('job-search');
    const searchBar = document.getElementById('search-bar');
    const priceRange = document.getElementById('price-range');
    const priceValue = document.getElementById('price-value');
    const distanceRange = document.getElementById('distance-range');
    const distanceValue = document.getElementById('distance-value');

    // order controls
    const jobFilter =
      document.getElementById('jobFilter') ||
      document.getElementById('ordersScope');

    const ongoingTab =
      document.getElementById('ongoingTab') ||
      document.getElementById('tabOngoing');

    const previousTab =
      document.getElementById('previousTab') ||
      document.getElementById('tabAccepted');

    const tabOngoing =
      document.getElementById('tabOngoing') ||
      document.getElementById('ongoingTab');
    const tabAccepted =
      document.getElementById('tabAccepted') ||
      document.getElementById('previousTab');

    // UI state
    let activeTab = 'ongoing'; // 'ongoing' | 'previous'
    let activeView = 'home';   // 'home' | 'find' | 'post' | 'orders' | 'profile'

    // helpers
    function sanitize(s) {
      return String(s || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c]));
    }

    function id() {
      return 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    }

    function mapCategoryToType(cat) {
      switch ((cat || '').toLowerCase()) {
        case 'educational':
          return 'Educational';
        case 'groceries':
          return 'Errand';
        case 'physical':
        case 'chores':
          return 'Physical';
        case 'tech':
          return 'Tech';
        default:
          return 'Creative';
      }
    }

    // --- Map + geolocation ---
    function initMap() {
      if (mapInitialized) return;
      const mapEl = document.getElementById('map');
      if (!mapEl || !window.L) return;

      const defaultCenter = [userLocation.lat, userLocation.lng];

      map = L.map('map').setView(defaultCenter, 14);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      userMarker = L.marker(defaultCenter).addTo(map)
        .bindPopup('You are here').openPopup();

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            userLocation.lat = latitude;
            userLocation.lng = longitude;
            const coords = [latitude, longitude];

            map.setView(coords, 15);
            if (userMarker) {
              map.removeLayer(userMarker);
            }
            userMarker = L.marker(coords).addTo(map)
              .bindPopup('You are here').openPopup();

            // After we know real user location, re-run distance filters
            if (activeView === 'find') {
              renderFindGrid();
            }
          },
          (err) => {
            console.warn('Geolocation error:', err);
          }
        );
      }

      mapInitialized = true;
    }

    // distance helper (Haversine)
    function getDistance(lat1, lng1, lat2, lng2) {
      const R = 6371; // km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    function distanceLabelForJob(job) {
      if (!job.location || typeof job.location !== 'object') return '';
      if (!('lat' in job.location) || !('lng' in job.location)) return '';
      const dist = getDistance(
        userLocation.lat,
        userLocation.lng,
        job.location.lat,
        job.location.lng
      );
      if (!isFinite(dist)) return '';
      if (dist < 1) {
        const m = Math.round(dist * 1000);
        return `${m} m away`;
      }
      return `${dist.toFixed(1)} km away`;
    }

    // PROFILE STATS
    function refreshProfileStats() {
      if (!profileJobsDoneEl || !profileJobsPostedEl) return;
      const jobsDone = jobs.filter(j => j.status === 'completed').length;
      const jobsPosted = jobs.filter(j => j.postedBy === 'me').length;
      profileJobsDoneEl.textContent = jobsDone;
      profileJobsPostedEl.textContent = jobsPosted;

      // Genre distribution: physical vs tutoring
      let physicalCount = 0;
      let tutoringCount = 0;
      for (const j of jobs) {
        if (!j.category) continue;
        if (j.category === 'educational') tutoringCount++;
        else if (['groceries', 'chores', 'other', 'physical'].includes(j.category)) physicalCount++;
      }
      const totalGenre = physicalCount + tutoringCount;
      let physicalPct = 0, tutoringPct = 0;
      if (totalGenre > 0) {
        physicalPct = Math.round((physicalCount / totalGenre) * 100);
        tutoringPct = 100 - physicalPct;
      }
      if (profilePhysicalPctEl) profilePhysicalPctEl.textContent = physicalPct + '%';
      if (profileTutoringPctEl) profileTutoringPctEl.textContent = tutoringPct + '%';
      if (profilePhysicalBar) profilePhysicalBar.style.width = physicalPct + '%';
      if (profileTutoringBar) profileTutoringBar.style.width = tutoringPct + '%';
    }

    // unified save
    function saveJobs() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
      refreshProfileStats();
    }

    // Ensure job shape (migrate older saved data)
    function ensureJobShape(job) {
      job.applicants = job.applicants || [];
      job.claimer = job.claimer || null;
      job.status = job.status || 'open';
      job.postedBy = job.postedBy || 'other';
      if (!job.type) {
        job.type = mapCategoryToType(job.category);
      }
      return job;
    }

    // seed demo data if empty
    function seedDemoIfNeeded() {
      if (jobs && jobs.length) return;

      const baseLat = 49.2606;
      const baseLng = -123.2460;
      const now = Date.now();

      const demo = [
        {
          title: 'Cat sitter',
          description: 'Look after my cat for the evening',
          price: 15,
          location: { label: 'UBC residence', lat: baseLat + 0.002, lng: baseLng + 0.001 },
          category: 'chores',
          created: now - 1000 * 60 * 60 * 24 * 5
        },
        {
          title: 'Bring boxes to car',
          description: 'Move boxes from HA to Nest parking',
          price: 5,
          location: { label: 'Student housing', lat: baseLat + 0.004, lng: baseLng + 0.002 },
          category: 'chores',
          created: now - 1000 * 60 * 60 * 24 * 4
        },
        {
          title: 'Formatting citations',
          description: 'Teach me to format APA',
          price: 12,
          location: { label: 'Koerner Library', lat: baseLat - 0.001, lng: baseLng + 0.003 },
          category: 'educational',
          created: now - 1000 * 60 * 60 * 24 * 3
        },
        {
          title: 'Setup printer',
          description: 'Help me set up my new printer',
          price: 8,
          location: { label: 'Marine Drive', lat: baseLat - 0.003, lng: baseLng - 0.002 },
          category: 'chores',
          created: now - 1000 * 60 * 60 * 24 * 2
        },
        {
          title: 'Grocery run',
          description: 'Buy milk & eggs',
          price: 10,
          location: { label: 'Local store', lat: baseLat + 0.006, lng: baseLng - 0.001 },
          category: 'groceries',
          created: now - 1000 * 60 * 60 * 12
        },
        {
          title: 'Math tutoring',
          description: '1 hour calculus help',
          price: 20,
          location: { label: 'Campus cafe', lat: baseLat + 0.001, lng: baseLng - 0.003 },
          category: 'educational',
          created: now - 1000 * 60 * 60 * 6
        }
      ];

      jobs = demo.map(j => ensureJobShape({
        id: id(),
        title: j.title,
        description: j.description,
        price: j.price || 0,
        location: j.location,
        category: j.category || 'other',
        status: 'open',
        applicants: [],
        claimer: null,
        created: j.created || Date.now(),
        postedBy: 'other'
      }));
      saveJobs();
    }

    // init jobs
    seedDemoIfNeeded();
    jobs = jobs.map(ensureJobShape);
    refreshProfileStats();

    // --- View switching ---
    function showView(view) {
      activeView = view;
      if (homeView) homeView.classList.toggle('hidden', view !== 'home');
      if (findView) findView.classList.toggle('hidden', view !== 'find');
      if (postView) postView.classList.toggle('hidden', view !== 'post');
      if (ordersView) ordersView.classList.toggle('hidden', view !== 'orders');
      if (profileView) profileView.classList.toggle('hidden', view !== 'profile');

      if (navHome) navHome.classList.toggle('active', view === 'home');
      if (navFind) navFind.classList.toggle('active', view === 'find');
      if (navPost) navPost.classList.toggle('active', view === 'post');
      if (navOrders) navOrders.classList.toggle('active', view === 'orders');
      if (navProfile) navProfile.classList.toggle('active', view === 'profile');

      if (view === 'home') initMap();
      if (view === 'orders') renderGrid();
      if (view === 'find') renderFindGrid();
      if (view === 'post') renderActiveListings();
      if (view === 'profile') refreshProfileStats();
    }

    // wire nav
    if (navHome) navHome.addEventListener('click', () => showView('home'));
    if (navFind) navFind.addEventListener('click', () => showView('find'));
    if (navPost) navPost.addEventListener('click', () => showView('post'));
    if (navOrders) navOrders.addEventListener('click', () => showView('orders'));
    if (navProfile) navProfile.addEventListener('click', () => showView('profile'));

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem(USER_KEY);
        currentUser = null;
        alert('Logged out (demo).');
        showView('find');
      });
    }

    // default landing
    showView('home');

    // --- Location autocomplete (Nominatim) ---
    function fetchLocationSuggestions(query) {
      if (!locationSuggestions) return;

      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query
      )}&addressdetails=1&limit=5`;

      fetch(url, {
        headers: {
          'Accept': 'application/json'
        }
      })
        .then(res => res.json())
        .then(data => {
          locationSuggestions.innerHTML = '';
          if (!Array.isArray(data) || !data.length) {
            locationSuggestions.classList.add('hidden');
            return;
          }

          data.forEach(item => {
            const opt = document.createElement('div');
            opt.className = 'location-suggestion-option';
            const label = item.display_name;
            opt.textContent = label;
            opt.addEventListener('click', () => {
              if (locEl) locEl.value = label;
              selectedLocationCoords = {
                lat: parseFloat(item.lat),
                lng: parseFloat(item.lon)
              };
              locationSuggestions.classList.add('hidden');
            });
            locationSuggestions.appendChild(opt);
          });

          locationSuggestions.classList.remove('hidden');
        })
        .catch(err => {
          console.error('Location search error', err);
        });
    }

    if (locEl && locationSuggestions) {
      locEl.addEventListener('input', () => {
        selectedLocationCoords = null;
        const q = locEl.value.trim();
        if (locationDebounceTimer) clearTimeout(locationDebounceTimer);

        if (q.length < 3) {
          locationSuggestions.classList.add('hidden');
          return;
        }

        locationDebounceTimer = setTimeout(() => {
          fetchLocationSuggestions(q);
        }, 400);
      });

      // hide suggestions when clicking outside
      document.addEventListener('click', (e) => {
        if (!locationSuggestions) return;
        if (e.target === locEl || locationSuggestions.contains(e.target)) return;
        locationSuggestions.classList.add('hidden');
      });
    }

    // --- Posting jobs ---
    if (jobForm) {
      jobForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const payload = {
          title: titleEl.value.trim(),
          description: descEl.value.trim(),
          price: priceEl.value.trim(),
          locationText: locEl.value.trim(),
          category: catEl.value
        };
        if (!payload.title || !payload.description || !payload.price || !payload.locationText || !payload.category) {
          alert('Please fill all fields (including category).');
          return;
        }
        const p = Number(payload.price);
        if (Number.isNaN(p) || p < 0) { alert('Enter a valid price'); return; }

        let locationValue;
        if (selectedLocationCoords) {
          locationValue = {
            label: payload.locationText,
            lat: selectedLocationCoords.lat,
            lng: selectedLocationCoords.lng
          };
        } else {
          // fallback: text only
          locationValue = payload.locationText;
        }

        const job = ensureJobShape({
          id: id(),
          title: payload.title,
          description: payload.description,
          price: p,
          location: locationValue,
          category: payload.category,
          status: 'open',
          applicants: [],
          claimer: null,
          created: Date.now(),
          postedBy: 'me'
        });

        jobs.push(job);
        saveJobs();
        jobForm.reset();
        if (catEl) catEl.value = '';
        selectedLocationCoords = null;
        showView('find');
        renderFindGrid();
      });
    }

    if (postCancel) {
      postCancel.addEventListener('click', () => {
        if (jobForm) jobForm.reset();
        if (catEl) catEl.value = '';
        selectedLocationCoords = null;
        showView('find');
      });
    }

    // --- Find Jobs: render cards ---
    function renderJobsList(jobsArray) {
      if (!jobSearchEl) return;
      jobSearchEl.innerHTML = '';

      if (!jobsArray.length) {
        jobSearchEl.innerHTML = '<div class="empty">No jobs match your filters.</div>';
        return;
      }

      jobsArray.forEach(job => {
        const tile = document.createElement('div');
        tile.className = 'job-tile ongoing';

        const rowTop = document.createElement('div');
        rowTop.className = 'row-top';

        const content = document.createElement('div');
        content.className = 'content';

        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = job.title;

        const subtitle = document.createElement('div');
        subtitle.className = 'subtitle';
        const typeLabel = job.type || mapCategoryToType(job.category);

        let subtitleText = `${typeLabel} • $${Number(job.price).toFixed(2)}`;
        const dLabel = distanceLabelForJob(job);
        if (dLabel) {
          subtitleText += ` • ${dLabel}`;
        }
        subtitle.textContent = subtitleText;

        const desc = document.createElement('div');
        desc.className = 'desc';
        desc.textContent = job.description;

        content.appendChild(title);
        content.appendChild(subtitle);
        content.appendChild(desc);

        rowTop.appendChild(content);
        tile.appendChild(rowTop);

        const actions = document.createElement('div');
        actions.className = 'row';
        actions.style.marginTop = '10px';

        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.type = 'button';
        btn.textContent = 'Request job';
        btn.addEventListener('click', () => applyToJob(job.id));

        actions.appendChild(btn);
        tile.appendChild(actions);

        jobSearchEl.appendChild(tile);
      });
    }

    function filterJobs() {
      if (!jobSearchEl) return;

      const searchText = (searchBar ? searchBar.value : '').toLowerCase();
      const selectedTypes = Array.from(
        document.querySelectorAll('.job-type-checkbox:checked')
      ).map(cb => cb.value);

      const maxPrice = priceRange ? Number(priceRange.value) : Infinity;
      const maxDistance = distanceRange ? Number(distanceRange.value) : Infinity;

      const openJobs = jobs.filter(j => j.status === 'open');

      if (statOpenCount) statOpenCount.textContent = openJobs.length;

      const filtered = openJobs.filter(job => {
        const title = (job.title || '').toLowerCase();
        const desc = (job.description || '').toLowerCase();
        const matchesSearch =
          title.includes(searchText) || desc.includes(searchText);

        const jobTypeLabel = job.type || mapCategoryToType(job.category);
        const matchesType =
          selectedTypes.length === 0 || selectedTypes.includes(jobTypeLabel);

        const matchesPrice = Number(job.price) <= maxPrice;

        let matchesDistance = true;
        if (
          job.location &&
          typeof job.location === 'object' &&
          'lat' in job.location &&
          'lng' in job.location
        ) {
          const dist = getDistance(
            userLocation.lat,
            userLocation.lng,
            job.location.lat,
            job.location.lng
          );
          matchesDistance = dist <= maxDistance;
        }

        return matchesSearch && matchesType && matchesPrice && matchesDistance;
      });

      renderJobsList(filtered);
    }

    function renderFindGrid() {
      filterJobs();
    }

    // wire filters
    if (searchBar) {
      searchBar.addEventListener('input', filterJobs);
    }
    if (priceRange) {
      if (priceValue) priceValue.textContent = priceRange.value;
      priceRange.addEventListener('input', () => {
        if (priceValue) priceValue.textContent = priceRange.value;
        filterJobs();
      });
    }
    if (distanceRange) {
      if (distanceValue) distanceValue.textContent = distanceRange.value + 'km';
      distanceRange.addEventListener('input', () => {
        if (distanceValue) distanceValue.textContent = distanceRange.value + 'km';
        filterJobs();
      });
    }
    document.querySelectorAll('.job-type-checkbox').forEach(cb => {
      cb.addEventListener('change', filterJobs);
    });

    // --- Apply to job ---
    function applyToJob(jobId) {
      const job = jobs.find(j => j.id === jobId);
      if (!job) return alert('Job not found');
      if (job.status !== 'open') return alert('Job is not accepting applicants');
      const nameRaw = prompt('Your name to apply:', currentUser || 'Guest');
      if (!nameRaw) return;
      const name = nameRaw.trim();
      if (!name) return;
      const placeholderRating = 'N/A';
      job.applicants = job.applicants || [];
      job.applicants.push({
        id: 'app_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
        name: name,
        rating: placeholderRating
      });

      if (name.toLowerCase() === 'guest') {
        job.claimer = { name: name, ratingGiven: null, ratingsHistory: [] };
        job.status = 'accepted';
        currentUser = name;
        localStorage.setItem(USER_KEY, currentUser);
        saveJobs();
        alert(`Applied as Guest and (demo) auto-accepted. Check Orders → For you.`);
      } else {
        saveJobs();
        alert('Applied — the poster will see you in Active listings.');
      }

      filterJobs();
      if (activeView === 'post') renderActiveListings();
    }

    // --- Post view: active listings + waitlist preview ---
    function renderActiveListings() {
      if (!activeListingsEl) return;
      activeListingsEl.innerHTML = '';
      const mine = jobs
        .filter(j => j.postedBy === 'me' && j.status === 'open')
        .sort((a, b) => b.created - a.created);

      if (!mine.length) {
        activeListingsEl.innerHTML = '<div class="empty">You have no active listings.</div>';
        return;
      }

      for (const job of mine) {
        const jobWrap = document.createElement('div');
        jobWrap.className = 'active-job';

        const hd = document.createElement('div');
        hd.style.display = 'flex';
        hd.style.justifyContent = 'space-between';
        hd.style.alignItems = 'center';

        const title = document.createElement('div');
        title.innerHTML = `<strong>${sanitize(job.title)}</strong>`;

        const meta = document.createElement('div');
        meta.className = 'small';
        meta.textContent = `$${Number(job.price).toFixed(2)} • ${job.category}`;

        hd.appendChild(title);
        hd.appendChild(meta);

        const desc = document.createElement('div');
        desc.className = 'desc';
        desc.textContent = job.description;

        const subh = document.createElement('div');
        subh.className = 'small';
        subh.style.marginTop = '8px';
        subh.textContent = 'Waitlist:';

        const list = document.createElement('div');
        list.style.marginTop = '8px';

        if (!job.applicants || !job.applicants.length) {
          list.innerHTML = '<div class="small">No applicants yet</div>';
        } else {
          for (const app of job.applicants) {
            const row = document.createElement('div');
            row.className = 'app-row';

            const info = document.createElement('div');
            info.innerHTML = `<div><strong>${sanitize(app.name)}</strong></div>
                              <div class="small">Rating: ${sanitize(String(app.rating || 'N/A'))}</div>`;

            const actions = document.createElement('div');
            const acceptBtn = document.createElement('button');
            acceptBtn.className = 'btn';
            acceptBtn.textContent = 'Accept';
            acceptBtn.onclick = () => {
              if (!confirm(`Accept ${app.name} for "${job.title}"?`)) return;
              acceptApplicantFromActive(job.id, app.id);
            };

            actions.appendChild(acceptBtn);
            row.appendChild(info);
            row.appendChild(actions);
            list.appendChild(row);
          }
        }

        jobWrap.appendChild(hd);
        jobWrap.appendChild(desc);
        jobWrap.appendChild(subh);
        jobWrap.appendChild(list);

        activeListingsEl.appendChild(jobWrap);
      }
    }

    function acceptApplicantFromActive(jobId, applicantId) {
      const job = jobs.find(j => j.id === jobId);
      if (!job) return alert('Job not found');
      const appIndex = (job.applicants || []).findIndex(a => a.id === applicantId);
      if (appIndex === -1) return alert('Applicant not found');
      const applicant = job.applicants.splice(appIndex, 1)[0];
      job.claimer = { name: applicant.name, ratingGiven: null, ratingsHistory: [] };
      job.status = 'accepted';
      saveJobs();
      alert(`Accepted ${applicant.name} for "${job.title}". It moved to Orders → Ongoing.`);
      renderActiveListings();
      showView('orders');
      activeTab = 'ongoing';
      if (tabOngoing) { tabOngoing.classList.add('active'); }
      if (tabAccepted) { tabAccepted.classList.remove('active'); }
      if (ongoingTab && ongoingTab.classList) ongoingTab.classList.add('active');
      if (previousTab && previousTab.classList) previousTab.classList.remove('active');
      renderGrid();
    }

    // --- Orders rendering ---
    function renderGrid() {
      if (!jobGrid) return;
      jobGrid.innerHTML = '';

      const scopeVal = (jobFilter && jobFilter.value)
        ? jobFilter.value
        : (document.getElementById('ordersScope')
          ? document.getElementById('ordersScope').value
          : 'others');

      let filtered = [];
      if (jobFilter) {
        const scope = scopeVal;
        if (scope === 'others') {
          filtered = jobs.filter(j =>
            j.postedBy === 'other' &&
            ((activeTab === 'ongoing' && j.status === 'accepted') ||
              (activeTab === 'previous' && j.status === 'completed')));
        } else {
          if (!currentUser) {
            jobGrid.innerHTML =
              '<div class="empty">No current user set — apply as "Guest" to make "For you" show items.</div>';
            return;
          }
          filtered = jobs.filter(j =>
            j.claimer &&
            j.claimer.name === currentUser &&
            ((activeTab === 'ongoing' && j.status === 'accepted') ||
              (activeTab === 'previous' && j.status === 'completed')));
        }
      } else {
        filtered = jobs.filter(j =>
          (activeTab === 'ongoing'
            ? j.status === 'accepted'
            : (activeTab === 'previous' ? j.status === 'completed' : true)));
      }

      if (!filtered.length) {
        jobGrid.innerHTML = '<div class="empty">No jobs to show in this tab.</div>';
        return;
      }

      filtered.sort((a, b) => b.created - a.created);

      for (const job of filtered) {
        const tile = document.createElement('div');
        tile.className = 'job-tile ' + (activeTab === 'ongoing' ? 'ongoing' : 'previous');

        const rowTop = document.createElement('div');
        rowTop.className = 'row-top';
        const imgDiv = document.createElement('div');
        imgDiv.className = 'img';
        const content = document.createElement('div');
        content.className = 'content';
        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = job.title;
        const subtitle = document.createElement('div');
        subtitle.className = 'subtitle';

        if (activeTab === 'ongoing') {
          subtitle.textContent = job.claimer && job.claimer.name
            ? `${job.claimer.name} is doing this.`
            : '';
        } else {
          subtitle.textContent = job.claimer && job.claimer.name
            ? `Done by ${job.claimer.name}`
            : '';
        }

        //if (jobFilter && jobFilter.value === 'others') {
         // const badge = document.createElement('span');
         // badge.style.display = 'inline-block';
         // badge.style.padding = '6px 8px';
         // badge.style.marginRight = '10px';
         // badge.style.background = '#222';
         // badge.style.color = 'white';
         // badge.style.borderRadius = '6px';
         // badge.style.fontSize = '12px';
         // badge.textContent = 'Chat';
         // content.appendChild(badge);
        //}

        const desc = document.createElement('div');
        desc.className = 'desc';
        desc.textContent = job.description;

        content.appendChild(title);
        content.appendChild(subtitle);
        content.appendChild(desc);
        rowTop.appendChild(imgDiv);
        rowTop.appendChild(content);
        tile.appendChild(rowTop);

        const actions = document.createElement('div');
        actions.className = 'row';
        actions.style.marginTop = '10px';

        if (activeTab === 'ongoing') {
          const completeBtn = document.createElement('button');
          completeBtn.className = 'btn';
          completeBtn.type = 'button';
          completeBtn.textContent = 'Mark completed';
          completeBtn.onclick = () => markCompleted(job.id);
          actions.appendChild(completeBtn);
        } else {
          const rateBtn = document.createElement('button');
          rateBtn.className = 'btn';
          rateBtn.type = 'button';
          const already =
            job.claimer &&
            job.claimer.ratingGiven !== undefined &&
            job.claimer.ratingGiven !== null &&
            job.claimer.ratingGiven !== 'N/A';
          rateBtn.textContent = already
            ? `Rated: ${job.claimer.ratingGiven}`
            : 'Rate';
          rateBtn.disabled = already;
          rateBtn.onclick = () => rateClaimer(job.id);
          actions.appendChild(rateBtn);
        }

        tile.appendChild(actions);
        jobGrid.appendChild(tile);
      }
    }

    const attachTabHandlers = () => {
      if (ongoingTab) {
        ongoingTab.onclick = () => {
          activeTab = 'ongoing';
          if (ongoingTab.classList) ongoingTab.classList.add('active');
          if (previousTab && previousTab.classList) previousTab.classList.remove('active');
          renderGrid();
        };
      }
      if (previousTab) {
        previousTab.onclick = () => {
          activeTab = 'previous';
          if (previousTab.classList) previousTab.classList.add('active');
          if (ongoingTab && ongoingTab.classList) ongoingTab.classList.remove('active');
          renderGrid();
        };
      }
      if (tabOngoing) {
        tabOngoing.onclick = () => {
          activeTab = 'ongoing';
          if (tabOngoing.classList) tabOngoing.classList.add('active');
          if (tabAccepted && tabAccepted.classList) tabAccepted.classList.remove('active');
          renderGrid();
        };
      }
      if (tabAccepted) {
        tabAccepted.onclick = () => {
          activeTab = 'previous';
          if (tabAccepted.classList) tabAccepted.classList.add('active');
          if (tabOngoing && tabOngoing.classList) tabOngoing.classList.remove('active');
          renderGrid();
        };
      }

      if (jobFilter) jobFilter.addEventListener('change', () => renderGrid());
      const ordersScope = document.getElementById('ordersScope');
      if (ordersScope) ordersScope.addEventListener('change', () => renderGrid());
    };
    attachTabHandlers();

    // --- Mark completed & Rate ---
    function markCompleted(jobId) {
      const job = jobs.find(j => j.id === jobId);
      if (!job) return alert('Job not found');
      if (job.status !== 'accepted') return alert('Job is not accepted');
      job.status = 'completed';
      job.completedAt = Date.now();
      job.claimer = job.claimer || { name: 'Unknown', ratingGiven: 'N/A', ratingsHistory: [] };
      if (job.claimer.ratingGiven === null || job.claimer.ratingGiven === undefined) {
        job.claimer.ratingGiven = 'N/A';
      }
      saveJobs();
      renderGrid();
    }

    function rateClaimer(jobId) {
      const job = jobs.find(j => j.id === jobId);
      if (!job) return alert('Job not found');
      if (job.status !== 'completed') return alert('Job must be completed to rate');
      if (!job.claimer) return alert('No claimer to rate');
      if (
        job.claimer.ratingGiven !== null &&
        job.claimer.ratingGiven !== undefined &&
        job.claimer.ratingGiven !== 'N/A'
      ) {
        return alert('Claimer already rated for this job');
      }

      const r = prompt(`Rate the claimer "${job.claimer.name}" (1-5):`, '5');
      if (r === null) return;
      const rn = Number(r);
      if (Number.isNaN(rn) || rn < 1 || rn > 5) {
        alert('Invalid rating — must be 1-5');
        return;
      }
      job.claimer.ratingGiven = rn;
      job.claimer.ratingsHistory = job.claimer.ratingsHistory || [];
      job.claimer.ratingsHistory.push({ value: rn, at: Date.now() });
      saveJobs();
      renderGrid();
    }

    // initial renders
    refreshProfileStats();
    renderFindGrid();
    renderGrid();
    renderActiveListings();

    // expose debug helpers
    window._TASKS = jobs;
    window._SAVE = saveJobs;
    window._USER = () => currentUser;
  }
})();
