/* examscorecalc.com — calculator engine v3. Dependency-free, client-side.
   NASA Power-of-10 oriented: small single-purpose functions, all numeric input
   clamped to fixed bounds, no recursion, no eval, fixed-length loops only. */
(function () {
  "use strict";
  var EXAM = window.EXAM;
  var root = document.getElementById("calc");
  if (!EXAM || !root) return;

  /* ---- small helpers ---- */
  function clampInt(v, lo, hi) {
    var n = Math.floor(Number(v));
    if (!isFinite(n)) return lo;
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }
  function interp(anchors, x) {            /* linear interpolation over fixed anchor pairs */
    if (x <= anchors[0][0]) return anchors[0][1];
    var i = 1, last = anchors.length;
    for (; i < last; i++) {
      if (x <= anchors[i][0]) {
        var a = anchors[i - 1], b = anchors[i];
        return a[1] + (x - a[0]) / (b[0] - a[0]) * (b[1] - a[1]);
      }
    }
    return anchors[last - 1][1];
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }

  /* ---- a single labelled number field with a "/ max" suffix ---- */
  function field(id, labelText, max, small, onInput) {
    var input = document.createElement("input");
    input.type = "number"; input.inputMode = "numeric"; input.id = id;
    input.min = "0"; input.max = String(max); input.placeholder = "0";
    input.setAttribute("aria-label", labelText + " out of " + max);
    var suffix = document.createElement("span");
    suffix.className = "input-suffix"; suffix.textContent = "/ " + max;
    var wrap = document.createElement("div");
    wrap.className = "input-wrap" + (small ? " sm" : "");
    wrap.appendChild(input); wrap.appendChild(suffix);
    input.addEventListener("input", onInput);
    var label = document.createElement("label");
    label.className = "field-label"; label.setAttribute("for", id); label.textContent = labelText;
    var cell = document.createElement("div");
    cell.appendChild(label); cell.appendChild(wrap);
    cell.read = function () { return input.value === "" ? null : clampInt(input.value, 0, max); };
    cell.touched = function () { return input.value !== ""; };
    return cell;
  }

  /* ---- sticky bottom result bar (one per page, hidden until input) ---- */
  function makeStickyBar() {
    var bar = document.createElement("div");
    bar.className = "sticky-result"; bar.hidden = true; bar.setAttribute("aria-hidden", "true");
    document.body.appendChild(bar);
    return bar;
  }
  var sticky = makeStickyBar();

  /* a small visually-hidden live region for screen readers (debounced) */
  var srStatus = document.createElement("div");
  srStatus.className = "sr-only"; srStatus.setAttribute("aria-live", "polite"); srStatus.setAttribute("role", "status");
  root.appendChild(srStatus);
  var srTimer = 0;
  function announce(text) { clearTimeout(srTimer); srTimer = setTimeout(function () { srStatus.textContent = text; }, 450); }

  var resultEl = document.createElement("div");

  function emptyState(unit) {
    resultEl.innerHTML = '<div class="result-empty"><div class="em-dash">&mdash;</div><p>Enter your scores to see your estimate</p></div>';
    sticky.hidden = true; sticky.setAttribute("aria-hidden", "true");
  }

  /* ============================== AP ============================== */
  function buildAP() {
    var inputs = document.createElement("div");
    inputs.className = "calc";

    /* multiple choice */
    var mcGroup = document.createElement("div");
    mcGroup.innerHTML = '<div class="field-group-label">Multiple Choice</div>';
    var mcField = field("mc-input", "Correct answers", EXAM.mcq.n, false, recompute);
    mcGroup.appendChild(mcField);
    inputs.appendChild(mcGroup);

    /* free response — per-part if defined, else a single field */
    var parts = (EXAM.frq.fields && EXAM.frq.fields.length) ? EXAM.frq.fields
      : [{ label: "Free-response points", max: EXAM.frq.max }];
    var frqGroup = document.createElement("div");
    frqGroup.innerHTML = '<div class="field-group-label">Free Response</div>';
    var frqFields = [];
    var perRow = parts.length > 2 ? 3 : (parts.length === 1 ? 1 : 2);
    var row = null, i = 0;
    for (; i < parts.length; i++) {
      if (i % perRow === 0) { row = document.createElement("div"); row.className = "frq-row"; frqGroup.appendChild(row); }
      var f = field("frq-" + i, parts[i].label, parts[i].max, true, recompute);
      f.className = "frq-cell";
      frqFields.push({ cell: f, max: parts[i].max });
      row.appendChild(f);
    }
    inputs.appendChild(frqGroup);

    root.appendChild(inputs);
    root.appendChild(resultEl);

    var cuts = EXAM.cutoffs;
    var LABELS = { 5: "Excellent", 4: "Strong", 3: "Passing", 2: "Below passing", 1: "Needs work" };
    function scoreOf(pct) {
      if (pct >= cuts["5"]) return 5;
      if (pct >= cuts["4"]) return 4;
      if (pct >= cuts["3"]) return 3;
      if (pct >= cuts["2"]) return 2;
      return 1;
    }

    function recompute() {
      var touched = mcField.touched();
      var frqTotal = 0, j = 0;
      for (; j < frqFields.length; j++) { var v = frqFields[j].cell.read(); if (v !== null) touched = true; frqTotal += v || 0; }
      if (!touched) { emptyState(); announce(""); return; }

      var mc = mcField.read() || 0;
      var mcContrib = (mc / EXAM.mcq.n) * (EXAM.mcq.weight * 100);
      var frqContrib = (frqTotal / EXAM.frq.max) * (EXAM.frq.weight * 100);
      var composite = mcContrib + frqContrib;
      var pr = Math.round(composite * 10) / 10;
      var sc = scoreOf(pr);
      var gapHtml;
      if (sc >= 5) { gapHtml = '<div class="gap top">Top score achieved</div>'; }
      else {
        var next = { 1: cuts["2"], 2: cuts["3"], 3: cuts["4"], 4: cuts["5"] }[sc];
        var gap = Math.ceil(next - pr);
        gapHtml = '<div class="gap">You\'re ' + gap + " percentage point" + (gap === 1 ? "" : "s") + " from a " + (sc + 1) + "</div>";
      }
      resultEl.innerHTML =
        '<div class="score-card">' +
          '<div class="score-num">' + sc + "</div>" +
          '<div class="score-of">out of 5 &middot; ' + LABELS[sc] + "</div>" +
          '<div class="composite">' + pr.toFixed(1) + "% composite</div>" +
          gapHtml +
          '<div class="breakdown"><div class="bd-rule"></div>' +
            '<div class="bd-row"><span class="k">Multiple Choice</span><span class="v">' + mc + " / " + EXAM.mcq.n + " &rarr; " + mcContrib.toFixed(1) + "%</span></div>" +
            '<div class="bd-row"><span class="k">Free Response</span><span class="v">' + frqTotal + " / " + EXAM.frq.max + " &rarr; " + frqContrib.toFixed(1) + "%</span></div>" +
            '<div class="bd-row total"><span class="k">Composite</span><span class="v">' + pr.toFixed(1) + "%</span></div>" +
          "</div>" +
          shareBtn("Estimated " + EXAM.short + " score: " + sc + "/5 (" + pr.toFixed(1) + "% composite) | MC " + mc + "/" + EXAM.mcq.n + ", FRQ " + frqTotal + "/" + EXAM.frq.max + " | via examscorecalc.com") +
          '<div class="estimate-note">Estimate only &mdash; not an official College Board score</div>' +
        "</div>";
      sticky.hidden = false; sticky.removeAttribute("aria-hidden");
      sticky.innerHTML =
        '<span class="sr-score">' + sc + '</span><span class="sr-of">out of 5</span>' +
        '<span class="sr-div"></span><span class="sr-pct">' + pr.toFixed(0) + '%</span><span class="sr-label">composite</span>';
      announce("Estimated " + EXAM.name + " score: " + sc + " out of 5, " + LABELS[sc]);
    }
    emptyState();
  }

  /* ====================== SAT / ACT (sectioned) ====================== */
  function buildSectioned(isACT) {
    var inputs = document.createElement("div");
    inputs.className = "calc";
    var group = document.createElement("div");
    group.innerHTML = '<div class="field-group-label">Raw correct answers</div>';
    var fields = [], k = 0;
    for (; k < EXAM.sections.length; k++) {
      var s = EXAM.sections[k];
      var f = field("sec-" + k, s.name, s.n, false, recompute);
      fields.push(f); group.appendChild(f);
    }
    inputs.appendChild(group);
    root.appendChild(inputs);
    root.appendChild(resultEl);

    var of = isACT ? "/ 36" : "/ 1600", maxLabel = isACT ? 36 : 1600;
    function bandLabel(t) {
      if (isACT) return t >= 33 ? "Excellent" : t >= 28 ? "Strong" : t >= 21 ? "Solid" : "Keep going";
      return t >= 1400 ? "Excellent" : t >= 1200 ? "Strong" : t >= 1000 ? "Solid" : "Keep going";
    }

    function recompute() {
      var touched = false, m = 0;
      for (; m < fields.length; m++) if (fields[m].touched()) touched = true;
      if (!touched) { emptyState(); announce(""); return; }

      var scaled = [], n = 0;
      for (; n < fields.length; n++) scaled.push(Math.round(interp(EXAM.sections[n].anchors, fields[n].read() || 0)));
      var total = isACT
        ? Math.round(scaled.reduce(function (a, b) { return a + b; }, 0) / scaled.length)
        : scaled.reduce(function (a, b) { return a + b; }, 0);
      var goal = isACT ? (total < 33 ? 33 : 36) : (total < 1500 ? 1500 : 1600);
      var gap = goal - total;
      var gapHtml = gap > 0
        ? '<div class="gap">You\'re ' + gap + " point" + (gap === 1 ? "" : "s") + " from a " + goal + "</div>"
        : '<div class="gap top">At or above a ' + goal + "</div>";
      var rows = "", p = 0;
      for (; p < EXAM.sections.length; p++)
        rows += '<div class="bd-row"><span class="k">' + esc(EXAM.sections[p].name) + '</span><span class="v">' + (fields[p].read() || 0) + " / " + EXAM.sections[p].n + " &rarr; " + scaled[p] + "</span></div>";
      resultEl.innerHTML =
        '<div class="score-card wide">' +
          '<div class="score-num">' + total + "</div>" +
          '<div class="score-of">out of ' + maxLabel + " &middot; " + bandLabel(total) + "</div>" +
          gapHtml +
          '<div class="breakdown"><div class="bd-rule"></div>' + rows +
            '<div class="bd-row total"><span class="k">' + (isACT ? "Composite" : "Total") + '</span><span class="v">' + total + "</span></div></div>" +
          shareBtn("Projected " + EXAM.name + " score: " + total + " " + of + " | via examscorecalc.com") +
          '<div class="estimate-note">Estimate only &mdash; raw-to-scaled varies by test form</div>' +
        "</div>";
      sticky.hidden = false; sticky.removeAttribute("aria-hidden");
      sticky.innerHTML =
        '<span class="sr-score">' + total + '</span><span class="sr-of">' + of + '</span>' +
        '<span class="sr-div"></span><span class="sr-pct">' + bandLabel(total) + '</span>';
      announce("Estimated " + EXAM.name + " score: " + total + " " + of);
    }
    emptyState();
  }

  function shareBtn(text) {
    return '<button type="button" class="copy-btn" data-share="' + esc(text) + '">Copy my result</button>';
  }
  root.addEventListener("click", function (e) {
    var b = e.target.closest(".copy-btn"); if (!b) return;
    var txt = b.getAttribute("data-share");
    function done() { b.textContent = "Copied ✓"; setTimeout(function () { b.textContent = "Copy my result"; }, 2000); }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { document.execCommand("copy"); } catch (err) { /* best-effort copy; outer handler covers failure */ }
      document.body.removeChild(ta); done();
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallback);
      else fallback();
    } catch (err) { fallback(); }
  });

  if (EXAM.type === "ap") buildAP();
  else buildSectioned(EXAM.type === "act");
})();
