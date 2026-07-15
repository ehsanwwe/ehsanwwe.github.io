/* ============================================================
   Ehsan Moradi — Portfolio interactions
   1. WebGL GLSL hero background (hand-written, no libraries)
   2. Scroll reveals, nav state, counters, tilt, cursor glow
   ============================================================ */

(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- footer year ---------- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ============================================================
     1. WebGL shader background
     Aurora / flow-field rendered in a fragment shader.
     ============================================================ */
  function initGL() {
    if (reducedMotion) return;
    var canvas = document.getElementById("gl");
    if (!canvas) return;
    var gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return; // graceful fallback: CSS gradient stays

    var vertSrc = [
      "attribute vec2 p;",
      "void main(){ gl_Position = vec4(p, 0.0, 1.0); }"
    ].join("\n");

    var fragSrc = [
      "precision mediump float;",
      "uniform vec2 r;",   // resolution
      "uniform float t;",  // time
      "uniform vec2 m;",   // mouse (0..1)
      "",
      "float hash(vec2 x){ return fract(sin(dot(x, vec2(127.1, 311.7))) * 43758.5453); }",
      "",
      "float noise(vec2 x){",
      "  vec2 i = floor(x), f = fract(x);",
      "  vec2 u = f * f * (3.0 - 2.0 * f);",
      "  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),",
      "             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);",
      "}",
      "",
      "float fbm(vec2 x){",
      "  float v = 0.0, a = 0.5;",
      "  for (int i = 0; i < 5; i++) {",
      "    v += a * noise(x);",
      "    x = x * 2.03 + vec2(11.7, 5.3);",
      "    a *= 0.5;",
      "  }",
      "  return v;",
      "}",
      "",
      "void main(){",
      "  vec2 uv = gl_FragCoord.xy / r;",
      "  vec2 q = uv * vec2(r.x / r.y, 1.0);",
      "",
      "  float tt = t * 0.045;",
      "  vec2 drift = (m - 0.5) * 0.35;",
      "",
      "  // domain-warped fbm (flow field)",
      "  vec2 w1 = vec2(fbm(q * 1.4 + tt), fbm(q * 1.4 - tt * 0.8 + 4.7));",
      "  vec2 w2 = vec2(fbm(q * 2.1 + w1 * 1.8 - tt * 0.6), fbm(q * 2.1 + w1 * 1.8 + tt * 0.5));",
      "  float f = fbm(q * 1.7 + w2 * 1.6 + drift);",
      "",
      "  // palette: deep navy -> slate -> green/cyan glow",
      "  vec3 base = vec3(0.027, 0.043, 0.086);",
      "  vec3 slate = vec3(0.075, 0.11, 0.19);",
      "  vec3 green = vec3(0.13, 0.77, 0.37);",
      "  vec3 cyan  = vec3(0.13, 0.83, 0.93);",
      "",
      "  vec3 col = mix(base, slate, smoothstep(0.25, 0.85, f));",
      "  float g1 = smoothstep(0.55, 0.95, fbm(q * 2.2 + w2 * 2.0 + tt * 0.4));",
      "  float g2 = smoothstep(0.6, 0.98, fbm(q * 2.6 - w1 * 1.7 - tt * 0.3 + 9.1));",
      "  col += green * g1 * 0.16;",
      "  col += cyan  * g2 * 0.13;",
      "",
      "  // faint engineering grid",
      "  vec2 gv = fract(q * 22.0 + drift * 2.0);",
      "  float grid = (1.0 - smoothstep(0.0, 0.06, min(gv.x, gv.y))) * 0.03;",
      "  col += vec3(0.35, 0.55, 0.6) * grid * (0.4 + 0.6 * f);",
      "",
      "  // vignette",
      "  float vig = smoothstep(1.25, 0.35, distance(uv, vec2(0.5, 0.45)));",
      "  col *= mix(0.72, 1.0, vig);",
      "",
      "  gl_FragColor = vec4(col, 1.0);",
      "}"
    ].join("\n");

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        return null;
      }
      return s;
    }

    var vs = compile(gl.VERTEX_SHADER, vertSrc);
    var fs = compile(gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) return;

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var uR = gl.getUniformLocation(prog, "r");
    var uT = gl.getUniformLocation(prog, "t");
    var uM = gl.getUniformLocation(prog, "m");

    var mouse = [0.5, 0.5], target = [0.5, 0.5];
    window.addEventListener("pointermove", function (e) {
      target[0] = e.clientX / window.innerWidth;
      target[1] = 1.0 - e.clientY / window.innerHeight;
    }, { passive: true });

    var dpiCap = Math.min(window.devicePixelRatio || 1, 1.5);
    function resize() {
      var w = Math.floor(window.innerWidth * dpiCap * 0.66);  // render at 2/3 res for perf
      var h = Math.floor(window.innerHeight * dpiCap * 0.66);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    }
    window.addEventListener("resize", resize, { passive: true });
    resize();

    var running = true;
    document.addEventListener("visibilitychange", function () {
      running = !document.hidden;
      if (running) requestAnimationFrame(frame);
    });

    var start = performance.now();
    function frame(now) {
      if (!running) return;
      mouse[0] += (target[0] - mouse[0]) * 0.05;
      mouse[1] += (target[1] - mouse[1]) * 0.05;
      gl.uniform2f(uR, canvas.width, canvas.height);
      gl.uniform1f(uT, (now - start) / 1000);
      gl.uniform2f(uM, mouse[0], mouse[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  initGL();

  /* ============================================================
     2. Scroll reveal
     ============================================================ */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reducedMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("visible");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach(function (el, i) {
      el.style.transitionDelay = Math.min(i % 6, 4) * 60 + "ms";
      io.observe(el);
    });
  } else {
    revealEls.forEach(function (el) { el.classList.add("visible"); });
  }

  /* ============================================================
     3. Topbar state + active nav link
     ============================================================ */
  var topbar = document.getElementById("topbar");
  window.addEventListener("scroll", function () {
    if (topbar) topbar.classList.toggle("scrolled", window.scrollY > 24);
  }, { passive: true });

  var navLinks = document.querySelectorAll(".nav a");
  var sections = [];
  navLinks.forEach(function (a) {
    var sec = document.querySelector(a.getAttribute("href"));
    if (sec) sections.push({ link: a, sec: sec });
  });
  if ("IntersectionObserver" in window) {
    var navIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          navLinks.forEach(function (a) { a.classList.remove("active"); });
          sections.forEach(function (s) {
            if (s.sec === en.target) s.link.classList.add("active");
          });
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach(function (s) { navIO.observe(s.sec); });
  }

  /* ---------- mobile nav ---------- */
  var toggle = document.getElementById("navToggle");
  var nav = document.querySelector(".nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    navLinks.forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ============================================================
     4. Animated counters
     ============================================================ */
  var counters = document.querySelectorAll(".stat dt[data-count]");
  function animateCount(el) {
    var end = parseInt(el.getAttribute("data-count"), 10);
    if (reducedMotion) { el.textContent = end; return; }
    var dur = 1400, t0 = null;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(end * eased);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if ("IntersectionObserver" in window) {
    var cIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          animateCount(en.target);
          cIO.unobserve(en.target);
        }
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cIO.observe(el); });
  } else {
    counters.forEach(function (el) { el.textContent = el.getAttribute("data-count"); });
  }

  /* ============================================================
     5. Card hover spotlight + subtle tilt
     ============================================================ */
  if (!reducedMotion && window.matchMedia("(hover: hover)").matches) {
    document.querySelectorAll("[data-tilt]").forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var rect = card.getBoundingClientRect();
        var x = (e.clientX - rect.left) / rect.width;
        var y = (e.clientY - rect.top) / rect.height;
        card.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
        card.style.setProperty("--my", (y * 100).toFixed(1) + "%");
        var rx = (0.5 - y) * 4;
        var ry = (x - 0.5) * 4;
        card.style.transform = "perspective(900px) rotateX(" + rx.toFixed(2) + "deg) rotateY(" + ry.toFixed(2) + "deg)";
      });
      card.addEventListener("pointerleave", function () {
        card.style.transform = "";
      });
    });

    /* cursor glow follows pointer */
    var glow = document.querySelector(".cursor-glow");
    if (glow) {
      window.addEventListener("pointermove", function (e) {
        glow.style.left = e.clientX + "px";
        glow.style.top = e.clientY + "px";
      }, { passive: true });
    }
  }
})();
