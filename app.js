/* Casa María Madre – app de gestión de ocupación (v1.1) */
(function () {
  'use strict';
  var C = window.CONFIG || {};
  var DEMO = !C.API_URL;
  var VERSION = '2.5.4';
  var VERSION_FECHA = '28/11/2026';
  var S = { clave: null, gestor: null, datos: null, mes: null, sinConexion: false, filtro: 'proximas', verCanceladas: false,
            relModo: 'todas', relDesde: '', relHasta: '', findesTodos: false };
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var vista = $('#vista');
  var TIPOS = ['Alojamiento', 'Día / sala', 'Bloqueo'];

  // ---------------- Almacenamiento local (con protección) ----------------
  function lsGet(k) { try { return JSON.parse(localStorage.getItem('mmp:' + k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem('mmp:' + k, JSON.stringify(v)); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem('mmp:' + k); } catch (e) {} }

  // ---------------- Utilidades ----------------
  /** «2026-11-09 00:25» (o una fecha en otro formato) → «09/11/2026 00:25». «#####» o vacío → ''. */
function marcaLegible(v) {
  var t = String(v || '').trim();
  if (!t || /^#+$/.test(t)) return '';
  var m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/);
  if (!m) {
    var d = new Date(t.replace(/\s*\(.*\)\s*$/, ''));
    if (isNaN(d)) return '';
    var dos = function (n) { return (n < 10 ? '0' : '') + n; };
    return dos(d.getDate()) + '/' + dos(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + dos(d.getHours()) + ':' + dos(d.getMinutes());
  }
  return m[3] + '/' + m[2] + '/' + m[1] + (m[4] ? ' ' + m[4] : '');
}
function entreParen(t) { return t ? ' (' + esc(t) + ')' : ''; }

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function aFecha(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function aTexto(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hoyTxt() { return aTexto(new Date()); }
  function legible(s) { var p = String(s).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : s; }
  function sumaDias(s, n) { var d = aFecha(s); d.setDate(d.getDate() + n); return aTexto(d); }
  function noches(r) { return Math.round((aFecha(r.salida) - aFecha(r.entrada)) / 864e5); }
  function momento(f, h) { return f + 'T' + h; }
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES_L = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  function nombreMes(d) { var t = d.toLocaleDateString('es-ES', { month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1) + ' ' + d.getFullYear(); }
  function diaSemana(s) { return aFecha(s).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function formatoTel(t) {
    var s = String(t || '').trim(); if (!s) return '';
    var pref = '', dig = s.replace(/[^\d+]/g, '');
    var m = dig.match(/^(\+\d{2}|0034)(\d{9})$/);
    if (m) { pref = (m[1] === '0034' ? '+34' : m[1]) + ' '; dig = m[2]; }
    if (/^\d{9}$/.test(dig)) return pref + dig.slice(0, 3) + ' ' + dig.slice(3, 6) + ' ' + dig.slice(6);
    return s;
  }
  function telValido(t) { return /^(\+\d{2} )?\d{3} \d{3} \d{3}$/.test(formatoTel(t)); }

  function toast(msg, error) {
    var t = $('#toast');
    t.textContent = msg; t.className = 'toast' + (error ? ' error' : ''); t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, error ? 5500 : 2800);
  }
  // El reloj solo aparece si la espera dura más de medio segundo (para que no parpadee en cada acción).
  var relojT = null;
  function cargando(on) {
    clearTimeout(relojT);
    if (on) relojT = setTimeout(function () { $('#cargando').hidden = false; }, 500);
    else $('#cargando').hidden = true;
  }
  function modal(html, alPulsar) {
    var m = $('#modal');
    m.innerHTML = '<div class="caja">' + html + '</div>';
    m.hidden = false;
    m.onclick = function (e) {
      if (e.target === m) { m.hidden = true; return; }
      if (alPulsar) alPulsar(e, function () { m.hidden = true; });
    };
  }
  function confirmar(texto, boton, peligro) {
    return new Promise(function (ok) {
      modal('<p>' + texto + '</p><div class="fila-btns"><button class="btn borde" data-r="0">Volver</button>' +
        '<button class="btn ' + (peligro ? 'peligro' : '') + '" data-r="1">' + esc(boton) + '</button></div>',
        function (e, cerrar) { var b = e.target.closest('[data-r]'); if (b) { cerrar(); ok(b.dataset.r === '1'); } });
      $('#modal').addEventListener('click', function f(e) { if (e.target === this) { this.removeEventListener('click', f); ok(false); } });
    });
  }

  // ---------------- Datos (todo pasa por database.js) ----------------
  /** Ejecuta una operación de database.js con el gestor actual y guarda el estado actualizado que devuelve. */
  function usarDB(fn) {
    DB.conectar({ gestor: S.gestor, clave: S.clave });
    return fn().then(function (r) { if (r && r.estado) fijarDatos(r.estado); return r; });
  }
  function cargarTodo() {
    DB.conectar({ gestor: S.gestor, clave: S.clave });
    return DB.cargarTodo().then(function (d) { fijarDatos(d); return d; });
  }

  function fijarDatos(d) { S.datos = d; S.sinConexion = false; S.ultimaCarga = Date.now(); lsSet('cache', { datos: d, cuando: Date.now() }); avisoConexion(); }

  function avisoConexion() {
    var a = $('#aviso');
    if (S.sinConexion) {
      var c = lsGet('cache');
      a.className = 'aviso';
      a.textContent = 'Sin conexión: datos del ' + (c ? new Date(c.cuando).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—') + '. No se pueden guardar cambios.';
      a.hidden = false;
    } else if (DEMO) {
      a.className = 'aviso demo'; a.textContent = 'MODO DEMOSTRACIÓN · los datos solo se guardan en este dispositivo'; a.hidden = false;
    } else a.hidden = true;
  }

  /** Pantallas donde se escribe: aquí nunca se redibuja solo (para no perder lo escrito). */
  function editando() { var v = ruta().vista; return v === 'nueva' || v === 'editar' || v === 'servicios' || v === 'admin' || v === 'reparto'; }

  /** Recarga datos. Si se está editando una reserva NO se redibuja (para no perder lo escrito). */
  function recargar(silencioso, forzar) {
    if (!silencioso) cargando(true);
    return cargarTodo().then(function () { if (forzar || !editando()) pintar(); })
      .catch(function (e) {
        if (e.codigo === 'CLAVE') return salir('La clave ya no es válida. Vuelve a entrar.');
        var c = lsGet('cache');
        if (c && (e.red || !S.datos)) { S.datos = c.datos; S.sinConexion = true; avisoConexion(); if (forzar || !editando()) pintar(); }
        else if (!silencioso) toast(e.message, true);
      })
      .then(function () { cargando(false); });
  }

  // ---------------- Datos derivados ----------------
  function habitaciones() { return (S.datos && S.datos.habitaciones) || []; }
  function hab(n) { return habitaciones().filter(function (h) { return h.numero === n; })[0]; }
  function capacidadDisponible() { return habitaciones().reduce(function (s, h) { return s + (h.estado === 'Disponible' ? h.capacidad : 0); }, 0); }
  function reservas() { return (S.datos && S.datos.reservas) || []; }
  function reserva(id) { return reservas().filter(function (r) { return r.id === id; })[0]; }
  function activas() { return reservas().filter(function (r) { return r.estado !== 'Cancelada'; }); }
  function ordenar(a) { return a.slice().sort(function (x, y) { return (x.entrada + x.horaEntrada).localeCompare(y.entrada + y.horaEntrada); }); }
  function tipo(r) { return r.tipo || 'Alojamiento'; }
  function esPasada(r) { return r.salida < hoyTxt(); }
  function pernoctan(r) { return (r.asignaciones || []).reduce(function (s, a) { return s + a.personas; }, 0); }
  /** Clases de color: estado, tipo, pasada y datos que faltan. */
  function clases(r) {
    var c = [];
    if (r.estado === 'Cancelada') c.push('cancelada');
    else if (tipo(r) === 'Bloqueo') c.push('bloqueo');
    else if (r.estado === 'Provisional') c.push('provisional');
    else if (tipo(r) === 'Día / sala') c.push('dia-sala');
    else c.push('confirmada');
    if (esPasada(r)) c.push('pasada');
    if (tipo(r) !== 'Bloqueo') { if (!r.telefono) c.push('sin-tel'); else if (!r.email) c.push('sin-email'); }
    return c.join(' ');
  }
  function etiquetas(r) {
    var t = '';
    if (r.estado === 'Cancelada') t += '<span class="etiqueta cancelada">Cancelada</span> ';
    else if (r.estado === 'Provisional' && tipo(r) !== 'Bloqueo') t += '<span class="etiqueta provisional">Provisional</span> ';
    if (r.formulario && r.formulario.estado === 'Recibido' && r.estado !== 'Cancelada') t += '<span class="etiqueta form">Formulario recibido</span> ';
    if (tipo(r) !== 'Alojamiento') t += '<span class="etiqueta tipo">' + esc(tipo(r)) + '</span> ';
    if (esPasada(r) && r.estado !== 'Cancelada') t += '<span class="etiqueta pasada">Pasada</span> ';
    if (tipo(r) !== 'Bloqueo') {
      if (!r.telefono) t += '<span class="etiqueta falta-tel">Sin teléfono</span> ';
      if (!r.email) t += '<span class="etiqueta falta-email">Sin email</span> ';
    }
    return t;
  }
  function rangoDias(r) {
    var a = aFecha(r.entrada), b = aFecha(r.salida);
    if (r.entrada === r.salida) return String(a.getDate());
    if (a.getMonth() === b.getMonth()) return a.getDate() + '-' + b.getDate();
    return a.getDate() + ' ' + MESES[a.getMonth()] + '-' + b.getDate() + ' ' + MESES[b.getMonth()];
  }
  function contactos() {
    var resp = {}, mails = {};
    ordenar(reservas()).forEach(function (r) {
      if (r.responsable) resp[r.responsable.trim().toLowerCase()] = { nombre: r.responsable.trim(), telefono: r.telefono || '', email: r.email || '' };
      if (r.email) mails[r.email.trim().toLowerCase()] = { email: r.email.trim(), nombre: r.responsable || '', telefono: r.telefono || '' };
    });
    return { resp: Object.keys(resp).map(function (k) { return resp[k]; }), mails: Object.keys(mails).map(function (k) { return mails[k]; }) };
  }

  // ---------------- Navegación ----------------
  var TITULOS = { calendario: 'Calendario', reservas: 'Reservas', nueva: 'Nueva reserva', editar: 'Editar reserva', reserva: 'Reserva', gestionar: 'Gestionar', ficha: 'Ficha de la reserva', ajustes: 'Ajustes', admin: 'Administración', servicios: 'Servicios y datos', hoja: 'Hoja de estancia', formulario: 'Formulario del grupo', reparto: 'Reparto de habitaciones', habitaciones: 'Hoja de habitaciones', contrato: 'Condiciones' };
  function ruta() {
    var h = location.hash.replace(/^#\/?/, '');
    var q = {}, partes = h.split('?');
    (partes[1] || '').split('&').forEach(function (kv) { if (kv) { var p = kv.split('='); q[p[0]] = decodeURIComponent(p[1] || ''); } });
    var seg = partes[0].split('/');
    return { vista: seg[0] || 'calendario', id: seg[1] ? decodeURIComponent(seg[1]) : null, q: q, hash: location.hash };
  }
  function ir(h) { if (location.hash === '#/' + h) pintar(); else location.hash = '/' + h; }
  function reemplazar(h) { if (location.hash === '#/' + h) pintar(); else location.replace('#/' + h); }
  var historial = 0;
  window.addEventListener('hashchange', function () { historial++; });
  function volver() { if (historial > 0 && history.length > 1) history.back(); else ir('calendario'); }
  /** 2.3.4: Pregunta antes de salir si la pantalla actual tiene cambios sin guardar. */
  function salirSiSinCambios(continuar) {
    if (typeof S.hayCambios !== 'function' || !S.hayCambios()) return continuar();
    modal('<p>Hay cambios sin guardar. ¿Salir sin guardar?</p><div class="fila-btns"><button class="btn borde" data-r="0">Seguir editando</button>' +
      '<button class="btn peligro" data-r="1">Salir sin guardar</button></div>',
      function (e, cerrar) {
        var b = e.target.closest('[data-r]'); if (!b) return;
        cerrar();
        if (b.dataset.r === '1') { S.hayCambios = null; continuar(); }
      });
  }
  /** 2.3.3: Destino al que vuelven «‹ Volver» y «Guardar» en las pantallas de trabajo de una reserva. */
  function destinoTrabajo(id, apPorDefecto) {
    var q = ruta().q || {}, idq = encodeURIComponent(id);
    if (q.desde === 'ficha') return 'reserva/' + idq;
    if (q.desde === 'hoja') return 'hoja/' + idq + '?modo=' + encodeURIComponent(q.modo || 'presupuesto') + (q.ap ? '&desde=gestionar&ap=' + encodeURIComponent(q.ap) : '');
    if (q.desde === 'habitaciones') return 'habitaciones/' + idq + (q.ap ? '?desde=gestionar&ap=' + encodeURIComponent(q.ap) : '');
    var ap = q.ap || apPorDefecto || '';
    return 'gestionar/' + idq + (ap ? '?abrir=' + encodeURIComponent(ap) : '');
  }
  // 1.9.0: «Volver» va abajo: en la barra de «Guardar» si la hay; si no, en una barra propia.
  function botonVolver() { return ''; }
  // 2.1.1: la barra de acciones («Volver», «Guardar»…) se ancla encima del menú, fuera de la zona que se desplaza,
  // para que no flote ni tape el contenido. Cada vista la sigue escribiendo dentro de #vista; aquí se mueve.
  (function anclarPie() {
    var app = $('#app'), menu = $('#menu');
    if (!app || !menu || !window.MutationObserver) return;
    new MutationObserver(function (ms) {
      // Solo cuando la vista añade algo (al mover la barra fuera también se produce un aviso, que se ignora)
      if (!ms.some(function (m) { return m.addedNodes.length; })) return;
      var nuevo = vista.querySelector('.pie-form');
      $$('#app > .pie-form').forEach(function (x) { if (x !== nuevo) x.remove(); });
      if (nuevo) app.insertBefore(nuevo, menu);
    }).observe(vista, { childList: true });
  })();
  function enlazarVolver(antes, destino, usarReplace) {
    var pie = vista.querySelector('.pie-form') || $('#app > .pie-form');  // 2.1.1: puede estar ya anclada
    var b = '<button type="button" class="btn borde js-volver">‹ Volver</button>';
    if (pie) { if (!pie.querySelector('.js-volver')) pie.insertAdjacentHTML('afterbegin', b); }
    else vista.insertAdjacentHTML('beforeend', '<div class="pie-form pie-volver">' + b + '</div>');
    $$('.js-volver').forEach(function (x) {
      x.onclick = function () {
        salirSiSinCambios(function () {
          if (antes) antes();
          if (destino) { if (usarReplace) reemplazar(destino); else ir(destino); }
          else volver();
        });
      };
    });
  }

  function pintar() {
    if (!S.clave) return pintarLogin();
    if (!S.datos) return;
    S.hayCambios = null;
    $$('#app > .pie-form').forEach(function (x) { x.remove(); });
    var r = ruta();
    if (r.vista === 'calendario' || r.vista === 'reservas') S.origenFicha = r.vista;
    $('#menu').hidden = false; $('#btnRecargar').hidden = false;
    $('#tituloVista').textContent = TITULOS[r.vista] || '';
    document.body.setAttribute('data-vista', r.vista);
    $$('.menu button').forEach(function (b) {
      b.classList.toggle('activo', b.dataset.ir === r.vista || (b.dataset.ir === 'reservas' && (r.vista === 'reserva' || r.vista === 'gestionar' || r.vista === 'ficha' || r.vista === 'servicios' || r.vista === 'hoja' || r.vista === 'formulario' || r.vista === 'reparto' || r.vista === 'habitaciones' || r.vista === 'contrato')) || (b.dataset.ir === 'ajustes' && r.vista === 'admin'));
    });
    vista.scrollTop = 0; window.scrollTo(0, 0);
    switch (r.vista) {
      case 'reservas': return pintarReservas();
      case 'reserva': return pintarDetalle(r.id);
      case 'gestionar': return pintarGestionar(r.id);
      case 'ficha': return pintarHojaFicha(r.id);
      case 'nueva': return pintarFormulario(null, r.q);
      case 'editar': return pintarFormulario(r.id, r.q);
      case 'ajustes': return pintarAjustes();
      case 'admin': return pintarAdmin();
      case 'servicios': return pintarServicios(r.id);
      case 'hoja': return pintarHoja(r.id, r.q.modo);
      case 'formulario': return pintarFormularioRecibido(r.id);
      case 'reparto': return pintarReparto(r.id);
      case 'habitaciones': return pintarHojaHab(r.id);
      case 'contrato': return pintarContrato(r.id);
      default: return pintarCalendario();
    }
  }

  // ---------------- Login ----------------
  function pintarLogin(msg) {
    document.body.setAttribute('data-vista', 'login');
    $('#menu').hidden = true; $('#btnRecargar').hidden = true;
    $('#tituloVista').textContent = 'Acceso';
    var gestores = C.GESTORES || [];
    var elegido = lsGet('gestor') || '';
    vista.innerHTML =
      '<div class="login"><img class="logo" src="icons/icon-192.png" alt="">' +
      '<h1>' + esc(C.NOMBRE_CASA || 'Casa') + '</h1><p class="sub">' + esc(C.SUBTITULO || '') + ' · Gestión de ocupación</p>' +
      '<div class="tarjeta"><label class="campo"><span>¿Quién eres?</span></label><div class="chips" id="lGestores">' +
      gestores.map(function (g) { return '<button type="button" class="chip' + (g === elegido ? ' activo' : '') + '">' + esc(g) + '</button>'; }).join('') +
      '</div><label class="campo" style="margin-top:12px"><span>Tu clave</span><input class="entrada" id="lClave" type="password" inputmode="numeric" autocomplete="current-password" placeholder="' + (DEMO ? 'En demostración: demo' : 'Clave personal') + '"></label>' +
      '<p class="error-txt" id="lError">' + esc(msg || '') + '</p>' +
      '<button class="btn ancho" id="lEntrar" style="margin-top:14px">Entrar</button></div>' +
      '<p class="sub" style="text-align:center;font-size:12px;margin-top:14px">Versión ' + VERSION + ' · ' + VERSION_FECHA + '</p></div>';
    $('#lGestores').onclick = function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      $$('.chip', this).forEach(function (c) { c.classList.remove('activo'); });
      b.classList.add('activo'); elegido = b.textContent;
    };
    if (DEMO) $('#lClave').value = 'demo';
    function entrar() {
      var clave = $('#lClave').value.trim();
      if (!elegido) return ($('#lError').textContent = 'Indica quién eres.');
      if (!clave) return ($('#lError').textContent = 'Escribe tu clave.');
      S.clave = clave; S.gestor = elegido;
      cargando(true);
      cargarTodo().then(function () {
        lsSet('clave', clave); lsSet('gestor', elegido);
        if (!location.hash || location.hash === '#/') location.hash = '/calendario'; else pintar();
      }).catch(function (e) {
        S.clave = null;
        $('#lError').textContent = e.codigo === 'CLAVE' ? 'Clave incorrecta para ' + elegido + '.' : (e.message || 'No se pudo conectar. Revisa la dirección API_URL de config.js.');
      }).then(function () { cargando(false); });
    }
    $('#lEntrar').onclick = entrar;
    $('#lClave').onkeydown = function (e) { if (e.key === 'Enter') entrar(); };
  }
  function salir(msg) { lsDel('clave'); lsDel('cache'); S.clave = null; S.datos = null; pintarLogin(msg); }

  // ---------------- Calendario (franjas por semana) ----------------
  function pintarCalendario() {
    var hoy = new Date();
    if (!S.mes) S.mes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    var m = S.mes, primero = new Date(m.getFullYear(), m.getMonth(), 1);
    var inicio = new Date(primero); inicio.setDate(1 - ((primero.getDay() + 6) % 7));
    var hoyT = hoyTxt();
    var acts = ordenar(activas().filter(function (r) { return r.salida >= hoyT; }));
    var canc = reservas().filter(function (r) { return r.estado === 'Cancelada' && r.salida >= hoyT; });
    var semanas = '';
    for (var w = 0; w < 6; w++) {
      var lunes = new Date(inicio); lunes.setDate(inicio.getDate() + w * 7);
      if (w >= 4 && lunes.getMonth() !== m.getMonth() && lunes > primero) break;
      var dias = [];
      for (var i = 0; i < 7; i++) { var d = new Date(lunes); d.setDate(lunes.getDate() + i); dias.push(aTexto(d)); }
      var ini = dias[0], fin = dias[6];
      // Celdas de días
      var celdas = dias.map(function (t, i) {
        var d = aFecha(t);
        var cs = t >= hoyT ? canc.filter(function (r) { return t >= r.entrada && t <= r.salida; }) : [];
        var cls = 'cdia' + (d.getMonth() !== m.getMonth() ? ' fuera' : '') + (t === hoyT ? ' hoy' : '') + (t < hoyT ? ' pasado' : '') + (i >= 5 ? ' fsem' : '');
        return '<button class="' + cls + '" style="grid-column:' + (i + 1) + ';grid-row:1/-1" data-f="' + t + '"' +
          (cs.length ? ' title="Cancelada: ' + esc(cs.map(function (r) { return r.grupo; }).join(', ')) + '"' : '') + '>' +
          '<span class="n">' + d.getDate() + '</span>' + (cs.length ? '<span class="marca-canc" aria-label="Reserva cancelada">✕</span>' : '') + '</button>';
      }).join('');
      // Franjas
      var segs = acts.filter(function (r) { return r.entrada <= fin && r.salida >= ini; }).map(function (r) {
        var a = r.entrada < ini ? 0 : dias.indexOf(r.entrada), b = r.salida > fin ? 6 : dias.indexOf(r.salida);
        return { r: r, a: a, b: b, empieza: r.entrada >= ini, acaba: r.salida <= fin };
      });
      var carriles = [], ocultos = [0, 0, 0, 0, 0, 0, 0];
      segs.forEach(function (s) {
        var c = 0; while (carriles[c] && carriles[c].some(function (o) { return !(s.b < o.a || s.a > o.b); })) c++;
        (carriles[c] = carriles[c] || []).push(s); s.c = c;
      });
      var MAXC = 3;
      var franjas = segs.map(function (s) {
        if (s.c >= MAXC) { for (var k = s.a; k <= s.b; k++) ocultos[k]++; return ''; }
        var r = s.r;
        var corta = s.b - s.a < 1;
        var txt = (s.empieza && !corta && tipo(r) !== 'Bloqueo' ? '<b>' + esc(r.horaEntrada) + '</b> ' : '') + esc(r.grupo) +
                  (s.acaba && !corta && tipo(r) !== 'Bloqueo' && r.entrada !== r.salida ? ' <b>→' + esc(r.horaSalida) + '</b>' : '');
        return '<button class="franja ' + clases(r) + (s.empieza ? ' ini' : '') + (s.acaba ? ' fin' : '') + '" data-id="' + esc(r.id) + '" ' +
          'style="grid-column:' + (s.a + 1) + '/' + (s.b + 2) + ';grid-row:' + (s.c + 2) + '" title="' + esc(r.grupo + ' · ' + legible(r.entrada) + ' ' + r.horaEntrada + ' → ' + legible(r.salida) + ' ' + r.horaSalida) + '">' +
          '<span class="punto"></span><span class="t">' + txt + '</span></button>';
      }).join('');
      var mas = ocultos.map(function (n, i) { return n ? '<span class="mas" style="grid-column:' + (i + 1) + ';grid-row:' + (MAXC + 2) + '">+' + n + '</span>' : ''; }).join('');
      semanas += '<div class="semana" style="grid-template-rows:22px repeat(' + Math.max(1, Math.min(carriles.length, MAXC)) + ',auto)' + (ocultos.some(Boolean) ? ' 16px' : '') + ' minmax(4px, 1fr)">' + celdas + franjas + mas + '</div>';
    }
    vista.innerHTML =
      '<div class="cal-solo">' +
      '<div class="mes-cab"><div class="mes-nav"><button class="icono" id="cAnt" aria-label="Mes anterior">‹</button>' +
      '<h2>' + esc(nombreMes(m)) + '</h2>' +
      '<button class="icono" id="cSig" aria-label="Mes siguiente">›</button></div>' +
      '<button class="hoy-btn" id="cHoy">Hoy</button></div>' +
      '<div class="dias-sem"><div>L</div><div>M</div><div>X</div><div>J</div><div>V</div><div>S</div><div>D</div></div>' +
      '<div id="rejilla">' + semanas + '</div></div>' +
      '<div class="cal-accesos"><button class="btn sec" data-acc="proximas">Próximas</button><button class="btn sec" data-acc="findes">Fines de semana</button></div>';
    $$('.cal-accesos [data-acc]').forEach(function (b) { b.onclick = function () { S.filtro = b.dataset.acc; ir('reservas'); }; });
    $('#cAnt').onclick = function () { S.mes = new Date(m.getFullYear(), m.getMonth() - 1, 1); pintarCalendario(); };
    $('#cSig').onclick = function () { S.mes = new Date(m.getFullYear(), m.getMonth() + 1, 1); pintarCalendario(); };
    if ($('#cHoy')) $('#cHoy').onclick = function () { S.mes = null; pintarCalendario(); };
    $('#rejilla').onclick = function (e) {
      var f = e.target.closest('.franja');
      if (f) return ir('reserva/' + encodeURIComponent(f.dataset.id));
      var b = e.target.closest('.cdia'); if (b) hojaDia(b.dataset.f);
    };
    // Deslizar a izquierda/derecha para cambiar de mes
    var x0 = null;
    $('#rejilla').addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    $('#rejilla').addEventListener('touchend', function (e) {
      if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 60) (dx < 0 ? $('#cSig') : $('#cAnt')).click();
    }, { passive: true });
  }

  /** Hoja con todo lo de un día (también lo cancelado) y botón de nueva reserva. */
  function hojaDia(f) {
    var lista = ordenar(reservas().filter(function (r) { return f >= r.entrada && f <= r.salida; }));
    var tf = diaSemana(f); tf = tf.charAt(0).toUpperCase() + tf.slice(1);
    modal('<p style="margin-bottom:10px"><b>' + esc(tf) + '</b></p>' +
      (lista.length ? lista.map(function (r) {
        return '<button class="linea-dia ' + clases(r) + '" data-id="' + esc(r.id) + '"><span class="punto"></span><span><b>' + esc(r.grupo) + '</b><br>' +
          '<small>' + esc(r.horaEntrada) + ' ' + legible(r.entrada) + ' → ' + esc(r.horaSalida) + ' ' + legible(r.salida) + '</small> ' + etiquetas(r) + '</span></button>';
      }).join('') : '<p class="sub">Día libre.</p>') +
      '<div class="fila-btns" style="margin-top:12px"><button class="btn borde" data-r="0">Cerrar</button>' +
      (f >= hoyTxt() ? '<button class="btn" data-r="nueva">Nueva reserva este día</button>' : '') + '</div>',
      function (e, cerrar) {
        var l = e.target.closest('.linea-dia'); if (l) { cerrar(); return ir('reserva/' + encodeURIComponent(l.dataset.id)); }
        var b = e.target.closest('[data-r]'); if (!b) return;
        cerrar(); if (b.dataset.r === 'nueva') ir('nueva?fecha=' + f);
      });
  }

  /** Atajo «✓ Confirmar» (en la ficha) para provisionales futuras: abre la edición ya marcada como Confirmada. */
  function puedeConfirmar(r) { return r.estado === 'Provisional' && tipo(r) !== 'Bloqueo' && !esPasada(r); }

  function tarjetaReserva(r) {
    var f = aFecha(r.entrada);
    return '<button class="reserva ' + clases(r) + '" data-id="' + esc(r.id) + '">' +
      '<div class="fecha"><span class="d">' + f.getDate() + '</span><span class="m">' + MESES[f.getMonth()] + '</span></div>' +
      '<div class="info"><b>' + esc(r.grupo) + '</b>' +
      '<span class="sub">' + legible(r.entrada) + ' → ' + legible(r.salida) + (tipo(r) === 'Alojamiento' ? ' · ' + noches(r) + ' noche' + (noches(r) === 1 ? '' : 's') : '') + '</span><br>' +
      (tipo(r) !== 'Bloqueo' ? '<span class="sub">' + (r.personas || 0) + ' personas' + (r.responsable ? ' · ' + esc(r.responsable) : '') + '</span><br>' : '') +
      etiquetas(r) + '</div></button>';
  }
  function enlazarTarjetas() {
    $$('.reserva[data-id]').forEach(function (b) { b.onclick = function () { ir('reserva/' + encodeURIComponent(b.dataset.id)); }; });
  }

  // ---------------- Reservas: listas, relación y fines de semana ----------------
  function pintarReservas() {
    var seg = '<div class="segmento cuatro" id="lFiltro">' +
      [['proximas', 'Próximas'], ['pasadas', 'Pasadas'], ['relacion', 'Lista reservas'], ['findes', 'Fines de semana']].map(function (x) {
        return '<button data-f="' + x[0] + '" class="' + (S.filtro === x[0] ? 'activo' : '') + '">' + x[1] + '</button>';
      }).join('') + '</div>';
    var cuerpo = S.filtro === 'relacion' ? htmlRelacion() : S.filtro === 'findes' ? htmlFindes() : htmlLista();
    vista.innerHTML = seg + cuerpo;
    $('#lFiltro').onclick = function (e) { var b = e.target.closest('button'); if (b) { S.filtro = b.dataset.f; pintarReservas(); } };
    if ($('#lCanc')) $('#lCanc').onchange = function () { S.verCanceladas = this.checked; pintarReservas(); };
    if ($('#rModo')) $('#rModo').onclick = function (e) { var b = e.target.closest('button'); if (b) { S.relModo = b.dataset.m; pintarReservas(); } };
    if ($('#rDesde')) $('#rDesde').onchange = function () { S.relDesde = this.value; pintarReservas(); };
    if ($('#rHasta')) $('#rHasta').onchange = function () { S.relHasta = this.value; pintarReservas(); };
    if ($('#fTodos')) $('#fTodos').onchange = function () { S.findesTodos = this.checked; pintarReservas(); };
    if ($('#rPdf')) $('#rPdf').onclick = function () { document.body.classList.add('imprimiendo'); window.print(); setTimeout(function () { document.body.classList.remove('imprimiendo'); }, 500); };
    if ($('#rCopiar')) $('#rCopiar').onclick = pedirCopia;
    $$('.findes [data-f]').forEach(function (b) { b.onclick = function () { ir('nueva?fecha=' + b.dataset.f + '&salida=' + b.dataset.s); }; });
    $$('.rel-item[data-id]').forEach(function (b) { b.onclick = function () { ir('reserva/' + encodeURIComponent(b.dataset.id)); }; });
    enlazarTarjetas();
  }

  function htmlLista() {
    var hoy = hoyTxt();
    var lista = reservas().filter(function (r) {
      if (r.estado === 'Cancelada' && !S.verCanceladas) return false;
      return S.filtro === 'proximas' ? r.salida >= hoy : r.salida < hoy;
    });
    lista = ordenar(lista); if (S.filtro === 'pasadas') lista.reverse();
    return '<label class="sub check"><input type="checkbox" id="lCanc"' + (S.verCanceladas ? ' checked' : '') + '> Mostrar canceladas</label>' +
      (lista.length ? lista.map(tarjetaReserva).join('') : '<div class="vacio">No hay reservas ' + (S.filtro === 'proximas' ? 'próximas' : 'pasadas') + '.</div>');
  }

  /** Relación cronológica con el formato habitual de la casa, mejorado. */
  function datosRelacion(d1, d2) {
    var rango = S.relModo === 'rango';
    // «Próximas y en curso»: las que aún no han terminado (salida hoy o después). «Entre fechas» permite ver las pasadas.
    var desde = rango ? (S.relDesde || '') : hoyTxt(), hasta = rango && S.relHasta ? S.relHasta : '9999-12-31';
    if (d1 != null) { desde = d1; hasta = d2; }
    var lista = ordenar(reservas().filter(function (r) { return r.salida >= desde && r.entrada <= hasta; }));
    var grupos = [], actual = null;
    lista.forEach(function (r) {
      var k = r.entrada.slice(0, 7);
      if (!actual || actual.k !== k) { actual = { k: k, mes: MESES_L[+k.slice(5, 7) - 1], anio: k.slice(0, 4), items: [] }; grupos.push(actual); }
      actual.items.push(r);
    });
    return grupos;
  }
  function lineaRelacion(r) {
    var partes = [];
    if (tipo(r) !== 'Bloqueo') {
      if (r.responsable) partes.push(esc(r.responsable));
      if (r.personas) partes.push(r.personas + ' pers.');
      partes.push(r.telefono ? esc(r.telefono) : '<span class="falta">sin teléfono</span>');
      partes.push(r.email ? esc(r.email) : '<span class="falta-m">sin email</span>');
    }
    var estado = r.estado === 'Cancelada' ? ' <span class="r-canc">CANCELADA</span>' :
                 (r.estado === 'Provisional' && tipo(r) !== 'Bloqueo') ? ' <span class="r-prov">PROVISIONAL</span>' : '';
    var tipoTxt = tipo(r) === 'Día / sala' ? ' <span class="r-tipo">(sin alojamiento)</span>' : '';
    return { dias: rangoDias(r), titulo: esc(r.grupo), negrita: tipo(r) === 'Bloqueo', estado: estado, tipo: tipoTxt,
             detalle: partes.join(' · '), obs: r.observaciones ? esc(r.observaciones) : '', cancelada: r.estado === 'Cancelada', id: r.id };
  }
  function htmlRelacion() {
    var grupos = datosRelacion();
    var cuerpo = grupos.map(function (g) {
      return '<h4 class="rel-mes">' + g.mes + ' <small>' + g.anio + '</small></h4>' + g.items.map(function (r) {
        var l = lineaRelacion(r);
        return '<button class="rel-item' + (l.cancelada ? ' rel-cancelada' : '') + '" data-id="' + esc(l.id) + '">' +
          '<span class="rel-dias">' + l.dias + ':</span> <span class="rel-tit' + (l.negrita ? ' negrita' : '') + '">' + l.titulo + '</span>' + l.tipo + l.estado +
          (l.detalle ? '<br><span class="rel-det">' + l.detalle + '</span>' : '') +
          (l.obs ? '<br><span class="rel-obs">' + l.obs + '</span>' : '') + '</button>';
      }).join('');
    }).join('');
    var rango = S.relModo === 'rango';
    return '<div class="tarjeta rel-filtro"><div class="segmento" id="rModo">' +
      '<button data-m="todas" class="' + (!rango ? 'activo' : '') + '">Próximas y en curso</button>' +
      '<button data-m="rango" class="' + (rango ? 'activo' : '') + '">Entre fechas</button></div>' +
      (rango ? '<div class="dos" style="margin-top:10px"><label class="campo"><span>Desde</span><input class="entrada" id="rDesde" type="date" value="' + esc(S.relDesde) + '"></label>' +
        '<label class="campo"><span>Hasta</span><input class="entrada" id="rHasta" type="date" value="' + esc(S.relHasta) + '"></label></div>' : '') +
      '<div class="fila-btns" style="margin-top:6px"><button class="btn sec" id="rPdf">PDF / Imprimir</button><button class="btn sec" id="rCopiar">Copiar reservas</button></div></div>' +
      '<div class="tarjeta" id="relacion"><div class="rel-cab">Lista de reservas · ' + esc(C.NOMBRE_CASA || '') + '<small>' + esc(textoRango()) + '</small></div>' +
      (cuerpo || '<div class="vacio">No hay reservas.</div>') + '</div>';
  }
  function textoRango() {
    if (S.relModo !== 'rango') return 'Próximas y en curso (desde el ' + legible(hoyTxt()) + ')';
    if (!S.relDesde && !S.relHasta) return 'Todas las reservas';
    return (S.relDesde ? 'Desde ' + legible(S.relDesde) : 'Hasta') + (S.relDesde && S.relHasta ? ' hasta ' : ' ') + (S.relHasta ? legible(S.relHasta) : '');
  }
  /** «Copiar reservas»: primero se elige el periodo; luego se copia la lista con formato (para pegar en Word, correo…). */
  function pedirCopia() {
    var rango = S.relModo === 'rango';
    var d1 = rango && S.relDesde ? S.relDesde : hoyTxt();
    var d2 = rango && S.relHasta ? S.relHasta : sumaDias(d1, 90);
    modal('<p style="margin-bottom:8px"><b>Copiar reservas</b></p><p class="sub" style="margin:0 0 10px">Elige el periodo. Después podrás pegar la lista, con su formato, en Word, en un correo o en otro programa.</p>' +
      '<div class="dos"><label class="campo"><span>Desde</span><input class="entrada" id="cDesde" type="date" value="' + esc(d1) + '"></label>' +
      '<label class="campo"><span>Hasta</span><input class="entrada" id="cHasta" type="date" value="' + esc(d2) + '"></label></div>' +
      '<p class="error-txt" id="cError"></p>' +
      '<div class="fila-btns" style="margin-top:8px"><button class="btn borde" data-r="0">Cancelar</button><button class="btn" data-r="1">Copiar</button></div>',
      function (e, cerrar) {
        var b = e.target.closest('[data-r]'); if (!b) return;
        if (b.dataset.r === '0') return cerrar();
        var a = $('#cDesde').value, z = $('#cHasta').value;
        if (!a || !z) { $('#cError').textContent = 'Indica las dos fechas.'; return; }
        if (z < a) { $('#cError').textContent = '«Hasta» debe ser posterior a «Desde».'; return; }
        var n = copiarReservas(a, z);
        cerrar();
        if (n === false) toast('Este navegador no deja copiar. Usa «PDF / Imprimir».', true);
        else toast(n ? 'Copiadas ' + n + (n === 1 ? ' reserva' : ' reservas') + '. Ya puedes pegarlas.' : 'No hay reservas en ese periodo.', !n);
      });
  }
  function copiarReservas(desde, hasta) {
    var grupos = datosRelacion(desde, hasta), n = 0;
    var st = { t: 'font-family:Georgia,serif;color:#85200C;font-size:16pt;font-weight:bold;margin:0 0 4pt',
      m: 'font-family:Calibri,Arial,sans-serif;font-size:12pt;font-weight:bold;color:#89588B;margin:14pt 0 4pt;border-bottom:1px solid #DAD6E4',
      p: 'font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#222;margin:0 0 10pt;line-height:1.35',
      d: 'color:#666;font-size:9.5pt', o: 'color:#666;font-size:9.5pt;font-style:italic' };
    var periodo = 'Del ' + legible(desde) + ' al ' + legible(hasta);
    var html = '<div><p style="' + st.t + '">Lista de reservas · ' + esc(C.NOMBRE_CASA || '') + '</p><p style="' + st.p + ';' + st.d + '">' + periodo + '</p>';
    var txt = 'LISTA DE RESERVAS · ' + (C.NOMBRE_CASA || '') + '\n' + periodo + '\n';
    grupos.forEach(function (g) {
      html += '<p style="' + st.m + '">' + g.mes + ' ' + g.anio + '</p>';
      txt += '\n' + g.mes.toUpperCase() + ' ' + g.anio + '\n';
      g.items.forEach(function (r) {
        n++;
        var l = lineaRelacion(r), det = l.detalle.replace(/<[^>]+>/g, '');
        var est = r.estado === 'Cancelada' ? 'CANCELADA' : (r.estado === 'Provisional' && tipo(r) !== 'Bloqueo') ? 'PROVISIONAL' : '';
        html += '<p style="' + st.p + '"><span' + (l.cancelada ? ' style="text-decoration:line-through;color:#999"' : '') + '>&#9632; <b>' + l.dias + ':</b> ' +
          (l.negrita ? '<b>' + l.titulo + '</b>' : l.titulo) + (tipo(r) === 'Día / sala' ? ' (sin alojamiento)' : '') + '</span>' +
          (est ? ' <b style="font-size:8.5pt;color:' + (est === 'CANCELADA' ? '#B42318' : '#B7791F') + '">' + est + '</b>' : '') +
          (det ? '<br><span style="' + st.d + '">' + det + '</span>' : '') + (l.obs ? '<br><span style="' + st.o + '">' + l.obs + '</span>' : '') + '</p>';
        var plano = function (h) { var x = document.createElement('div'); x.innerHTML = h; return x.textContent; };
        txt += '■ ' + l.dias + ': ' + plano(l.titulo) + (tipo(r) === 'Día / sala' ? ' (sin alojamiento)' : '') + (est ? ' · ' + est : '') + '\n' +
          (det ? '   ' + plano(det) + '\n' : '') + (l.obs ? '   ' + plano(l.obs) + '\n' : '');
      });
    });
    html += '</div>';
    if (!n) return 0;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([txt], { type: 'text/plain' }) })])
          .catch(function () { if (!copiaAntigua(html)) toast('No se pudo copiar. Usa «PDF / Imprimir».', true); });
        return n;
      }
      return copiaAntigua(html) ? n : false;
    } catch (e) { return copiaAntigua(html) ? n : false; }
  }
  function copiaAntigua(html) {
    var d = document.createElement('div');
    d.contentEditable = 'true'; d.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    d.innerHTML = html; document.body.appendChild(d);
    var rg = document.createRange(); rg.selectNodeContents(d);
    var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rg);
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    sel.removeAllRanges(); d.remove(); return ok;
  }

  /** Próximos fines de semana: libres, con provisionales, ocupados. */
  function htmlFindes() {
    var hoy = new Date(); var sab = new Date(hoy); sab.setDate(hoy.getDate() + ((6 - hoy.getDay() + 7) % 7));
    var acts = activas(), filas = '';
    for (var i = 0; i < 30; i++) {
      var s = aTexto(sab), d = sumaDias(s, 1), v = sumaDias(s, -1);
      var en = acts.filter(function (r) { return r.entrada <= d && r.salida >= s; });
      var ocupa = en.filter(function (r) { return tipo(r) !== 'Día / sala' && (r.estado === 'Confirmada' || tipo(r) === 'Bloqueo'); });
      var prov = en.filter(function (r) { return tipo(r) !== 'Día / sala' && r.estado === 'Provisional' && tipo(r) !== 'Bloqueo'; });
      var dia = en.filter(function (r) { return tipo(r) === 'Día / sala'; });
      var est = ocupa.length ? 'ocupado' : prov.length ? 'provisional' : 'libre';
      if (est !== 'ocupado' || S.findesTodos) {
        var a = aFecha(s), b = aFecha(d);
        var txt = est === 'libre' ? 'Libre' : est === 'provisional' ? 'Provisional: ' + prov.map(function (r) { return esc(r.grupo); }).join(', ') : 'Ocupado: ' + ocupa.map(function (r) { return esc(r.grupo); }).join(', ');
        filas += '<div class="finde ' + est + '"><div class="fd-fecha"><b>' + a.getDate() + '-' + b.getDate() + '</b><span>' + MESES[b.getMonth()] + ' ' + b.getFullYear() + '</span></div>' +
          '<div class="fd-info"><b>' + txt + '</b>' + (dia.length ? '<br><small>Evento de día: ' + dia.map(function (r) { return esc(r.grupo); }).join(', ') + '</small>' : '') + '</div>' +
          (est !== 'ocupado' ? '<button class="btn sec mini" data-f="' + v + '" data-s="' + d + '">Reservar</button>' : '') + '</div>';
      }
      sab.setDate(sab.getDate() + 7);
    }
    return '<label class="sub check"><input type="checkbox" id="fTodos"' + (S.findesTodos ? ' checked' : '') + '> Mostrar también los ocupados</label>' +
      '<p class="sub" style="margin:0 0 10px">Próximos 30 fines de semana (sábado-domingo). «Reservar» propone entrada el viernes.</p>' +
      '<div class="findes">' + (filas || '<div class="vacio">No hay fines de semana libres.</div>') + '</div>';
  }

  // ---------------- Plano ----------------
  var PLANO_SUP = [11, 12, 'ESCALERAS', 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
  var PLANO_INF = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 'ESC. / ASC.', 25, 24, 23];
  function plano(asig) {
    var map = {}; (asig || []).forEach(function (a) { map[a.habitacion] = a.personas; });
    function celda(x) {
      if (typeof x === 'string') return '<div class="hab esc"' + (x === 'ESCALERAS' ? ' style="grid-column:span 2"' : '') + '>' + x + '</div>';
      var h = hab(x); if (!h) return '<div class="hab"></div>';
      var p = map[x] || 0;
      var cls = h.estado !== 'Disponible' ? 'cerrada' : p >= h.capacidad ? 'llena' : p > 0 ? 'usada' : '';
      return '<div class="hab ' + cls + '"><b>' + x + '</b>' + (h.estado !== 'Disponible' ? '—' : p + '/' + h.capacidad) + '</div>';
    }
    return '<div class="plano"><div class="plano-fila">' + PLANO_SUP.map(celda).join('') + '</div>' +
      '<div class="pasillo">PASILLO</div><div class="plano-fila">' + PLANO_INF.map(celda).join('') + '</div></div>' +
      '<div class="leyenda"><span><i style="background:var(--ok-suave);border:1.5px solid var(--ok)"></i>Completa</span><span><i style="background:var(--pri-suave);border:1.5px solid var(--pri-2)"></i>Parcial</span><span><i style="background:#e6e6e6"></i>Cerrada</span></div>';
  }

  // ---------------- Detalle ----------------
  // ---------------- 1.9.0 · Ficha de la reserva: evolución, siguiente paso y bitácora ----------------
  /** Última anotación de la bitácora cuya acción empieza por alguno de los textos dados. */
  function ultimaNota(r, acciones) {
    return (r.bitacora || []).filter(function (b) { return acciones.some(function (a) { return b.accion.indexOf(a) === 0; }); })[0] || null;
  }
  function cuandoQuien(b) { return b ? fechaCorta(b.fecha) + ' · ' + b.gestor : ''; }
  function fechaCorta(m) { var t = String(m || ''); return t ? legible(t.slice(0, 10)).slice(0, 5) : ''; }
  /** Estado de un documento según su última marca: { enviado, b } */
  function marcaDoc(r, si, no) { var b = ultimaNota(r, [si, no]); return { enviado: !!(b && b.accion.indexOf(si) === 0), b: b }; }
  // 2.1.0: «fianza» pasa a llamarse «señal» (se leen también las anotaciones antiguas)
  function senalPagada(r) {
    var b = ultimaNota(r, ['Señal pagada', 'Señal pendiente', 'Fianza pagada', 'Fianza pendiente']);
    if (b) return { pagada: b.accion === 'Señal pagada' || b.accion === 'Fianza pagada', b: b };
    var s = parseFloat(String((r.grupoDatos || {}).senal || '').replace(',', '.'));
    return { pagada: s > 0, b: null };
  }

  /** Lunes de la semana en que falta un mes para la entrada (igual que fechaAviso_ del puente). */
  function fechaAviso(entrada) {
    var p = String(entrada || '').split('-');
    if (p.length < 3) return '';
    var y = +p[0], m = +p[1] - 1, d = +p[2];
    m -= 1; if (m < 0) { m = 11; y -= 1; }
    var ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    var f = new Date(Date.UTC(y, m, Math.min(d, ultimo)));
    f.setUTCDate(f.getUTCDate() - ((f.getUTCDay() + 6) % 7));
    return f.toISOString().slice(0, 10);
  }
  function diasDesde(marca, hoy) {
    var f = String(marca || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return 0;
    return Math.round((aFecha(hoy) - aFecha(f)) / 864e5);
  }

  /** Los pasos de la reserva, con su estado: ok (hecho), ahora (en curso), aviso (revisar), pend (pendiente). */
  function pasosReserva(r, desde) {
    var P = [], hoy = hoyTxt(), aloj = tipo(r) === 'Alojamiento', idq = encodeURIComponent(r.id);
    function suf(ap) { return desde === 'ficha' ? 'desde=ficha' : ('desde=gestionar&ap=' + ap); }
    // 1. Reserva
    var conf = ultimaNota(r, ['Reserva confirmada']), crea = ultimaNota(r, ['Crear']);
    P.push(r.estado === 'Confirmada'
      ? { t: 'Reserva', ap: 'datos', e: 'ok', txt: 'Hecha · confirmada', cq: cuandoQuien(conf) }
      : { t: 'Reserva', ap: 'datos', e: 'ok', txt: 'Hecha · provisional', cq: cuandoQuien(crea) || (r.creadoPor ? fechaCorta(r.creadoEl) + ' · ' + r.creadoPor : ''),
          acc: { txt: 'Confirmar', fn: function () { ir('editar/' + idq + '?confirmar=1&' + suf('datos')); } } });
    // 2. Presupuesto y condiciones (2.2.0: solo la firma, sin la señal)
    var fi = r.firma, papel = marcaDoc(r, 'Contrato firmado en papel', 'Contrato: marcado sin firmar');
    var cEnv = ultimaNota(r, ['Contrato enviado', 'Contrato: enlace creado']);
    var firmado = (fi && fi.estado === 'Firmado') || papel.enviado, esperaFirma = !firmado && fi && fi.estado === 'Pendiente';
    var cTxt = fi && fi.estado === 'Firmado' ? 'Aceptado por ' + fi.nombre : papel.enviado ? 'Firmado en papel' : esperaFirma ? 'Enviado, esperando al grupo' : 'Sin enviar';
    var cCq = fi && fi.estado === 'Firmado' ? fechaCorta(fi.firmadoEl) + ' · ' + fi.nombre : papel.enviado ? cuandoQuien(papel.b) : esperaFirma ? cuandoQuien(cEnv) : '';
    var verPre = { txt: 'Ver presupuesto', fn: function () { ir('hoja/' + idq + '?modo=presupuesto&' + suf('condiciones')); } };
    P.push({ t: 'Condiciones', ap: 'condiciones', e: firmado ? 'ok' : esperaFirma ? 'ahora' : 'pend',
      txt: cTxt, cq: cCq,
      acc: firmado ? { txt: 'Ver condiciones', fn: function () { ir('contrato/' + idq + '?' + suf('condiciones')); } }
        : { txt: esperaFirma ? 'Reenviar' : 'Enviar para aceptar', fn: function () { enviarContrato(r); } },
      marcas: [verPre].concat(firmado ? [] : [{ txt: 'Firmado en papel', tipo: 'contrato_papel' }]).concat(papel.enviado ? [{ txt: 'Deshacer: papel', tipo: 'contrato_papel_no' }] : []),
      espera: esperaFirma,
      sig: !firmado && !esperaFirma ? 'Enviar el presupuesto y las condiciones' : '' });
    // 3. Fianza (2.5.0: solo si el grupo la paga; con ella pagada, la reserva queda confirmada)
    var sinFz = r.pagaFianza === 'No';
    var fz = senalPagada(r), tieneComp = !!(fi && fi.comprobante);
    var fechaFirma = (fi && fi.firmadoEl) || (papel.enviado && papel.b ? papel.b.fecha : '');
    if (!sinFz) {
      var mas7 = firmado && !fz.pagada && !tieneComp && fechaFirma && diasDesde(fechaFirma, hoy) >= 7;
      var sEst = fz.pagada ? 'ok' : (tieneComp || mas7) ? 'aviso' : firmado ? 'ahora' : 'pend';
      var sTxt = fz.pagada ? 'Pagada' : tieneComp ? 'Comprobante recibido · comprobar' : mas7 ? 'Pendiente · más de 7 días' : 'Pendiente';
      var sCq = fz.pagada ? (fz.b ? cuandoQuien(fz.b) : '') : tieneComp ? (fi.comprobanteEl ? fechaCorta(fi.comprobanteEl) + ' · Grupo' : '') : '';
      var fzMarca = fz.pagada ? { txt: 'Deshacer: fianza', tipo: 'fianza_pendiente' } : { txt: 'Marcar fianza pagada', tipo: 'fianza_pagada' };
      var sMarcas = [];
      if (tieneComp) sMarcas.push({ txt: 'Ver comprobante', fn: function () { verComprobante(r); } });
      sMarcas.push(fzMarca);
      if (!fz.pagada && (firmado || esperaFirma)) sMarcas.push({ txt: 'Recordar la fianza', fn: function () { recordarSenal(r); } });
      var sSig = '', sAcc = null;
      if (!fz.pagada) {
        if (tieneComp) { sSig = 'Comprobar la fianza'; sAcc = { txt: 'Ver comprobante', fn: function () { verComprobante(r); } }; }
        else if (mas7) { sSig = 'Recordar la fianza'; sAcc = { txt: 'Recordar la fianza', fn: function () { recordarSenal(r); } }; }
      }
      P.push({ t: 'Fianza', ap: 'condiciones', e: sEst, txt: sTxt, cq: sCq,
        acc: sAcc, marcas: sMarcas,
        espera: firmado && !fz.pagada && !tieneComp && !mas7,
        sig: sSig, sigMarca: '' });
    }
    // 4. Formulario del grupo
    var f = r.formulario, fuera = hoy > r.entrada;
    var env = ultimaNota(r, ['Formulario: enlace enviado', 'Formulario: enlace compartido', 'Formulario: enlace copiado', 'Formulario: enlace creado']);
    var rec = ultimaNota(r, ['Formulario recibido']), apl = ultimaNota(r, ['Formulario aplicado']);
    var tocaForm = (sinFz ? firmado : fz.pagada) && hoy >= fechaAviso(r.entrada);
    if (!f) P.push(fuera ? { t: 'Formulario', ap: 'formulario', e: 'pend', txt: 'No se envió', cq: '' }
      : { t: 'Formulario', ap: 'formulario', e: 'pend', txt: 'Sin enviar', cq: '', acc: { txt: 'Enviar', fn: function () { enviarEnlaceForm(r); } }, sig: tocaForm ? 'Enviar el formulario al grupo' : '' });
    else if (f.estado === 'Recibido') P.push({ t: 'Formulario', ap: 'formulario', e: 'aviso', txt: 'Recibido · falta revisar y aplicar', cq: cuandoQuien(rec) || fechaCorta(f.enviadoEl) + ' · Grupo',
      acc: { txt: 'Revisar', fn: function () { ir('formulario/' + idq + '?' + suf('formulario')); } }, sig: 'Revisar y aplicar el formulario' });
    else if (f.estado === 'Aplicado') P.push({ t: 'Formulario', ap: 'formulario', e: 'ok', txt: 'Recibido y aplicado', cq: cuandoQuien(apl) });
    else if (f.datos) P.push({ t: 'Formulario', ap: 'formulario', e: 'ok', txt: 'Recibido', cq: fechaCorta(f.enviadoEl) + ' · Grupo' });
    else if (f.estado === 'Cerrado' || fuera) P.push({ t: 'Formulario', ap: 'formulario', e: 'pend', txt: 'Sin respuesta del grupo', cq: '' });
    else P.push({ t: 'Formulario', ap: 'formulario', e: 'ahora', txt: 'Enviado · esperando al grupo', cq: cuandoQuien(env), espera: true,
      acc: { txt: 'Reenviar', fn: function () { enviarEnlaceForm(r); } } });
    // 5. Habitaciones (solo con alojamiento)
    if (aloj) {
      var rep = ultimaNota(r, ['Reparto de habitaciones']), n = (r.asignaciones || []).length;
      var reenv = f && f.enviadoEl && repartoSegun(r) && f.enviadoEl > repartoSegun(r);
      var formAplicado = !!(f && f.estado === 'Aplicado');
      if (!n) P.push({ t: 'Habitaciones', ap: 'habitaciones', e: 'pend', txt: 'Sin reparto', cq: '', acc: { txt: 'Repartir', fn: function () { ir('reparto/' + idq + '?' + suf('habitaciones')); } }, sig: formAplicado ? 'Hacer el reparto de habitaciones' : '' });
      else P.push({ t: 'Habitaciones', ap: 'habitaciones', e: reenv ? 'aviso' : 'ok', txt: n + ' hab. · ' + pernoctan(r) + ' pers.' + (reenv ? ' · el grupo cambió su formulario' : ''),
        cq: cuandoQuien(rep), acc: { txt: reenv ? 'Revisar' : 'Ver', fn: function () { ir('reparto/' + idq + '?' + suf('habitaciones')); } }, sig: reenv ? 'Revisar el reparto de habitaciones' : '' });
    }
    // 7. Estancia
    var dias = Math.round((aFecha(r.entrada) - aFecha(hoy)) / 864e5);
    P.push(hoy < r.entrada ? { t: 'Estancia', ap: 'estancia', e: 'pend', txt: 'Empieza ' + (dias === 1 ? 'mañana' : 'en ' + dias + ' días'), cq: '' }
      : hoy <= r.salida ? { t: 'Estancia', ap: 'estancia', e: 'ahora', txt: 'En curso hasta el ' + legible(r.salida).slice(0, 5), cq: '' }
      : { t: 'Estancia', ap: 'estancia', e: 'ok', txt: 'Terminada el ' + legible(r.salida).slice(0, 5), cq: '' });
    // 8. Liquidación
    var liq = marcaDoc(r, 'Liquidación enviada', 'Liquidación: marcada'), empezo = hoy >= r.entrada;
    P.push(liq.enviado ? { t: 'Liquidación', ap: 'estancia', e: 'ok', txt: 'Enviada', cq: cuandoQuien(liq.b), acc: { txt: 'Ver', fn: function () { ir('hoja/' + idq + '?modo=liquidacion&' + suf('estancia')); } }, marca: { txt: 'Deshacer', tipo: 'liquidacion_no' } }
      : { t: 'Liquidación', ap: 'estancia', e: empezo ? 'ahora' : 'pend', txt: 'Pendiente', cq: '', acc: empezo ? { txt: 'Hacer', fn: function () { ir('hoja/' + idq + '?modo=liquidacion&' + suf('estancia')); } } : null,
          marca: empezo ? { txt: 'Marcar enviada', tipo: 'liquidacion_enviada' } : null, sig: empezo ? 'Hacer y enviar la liquidación' : '' });
    // 9. Cobrado (2.5.0: la reserva se cierra al cobrar la liquidación)
    var cob = marcaDoc(r, 'Cobrado', 'Cobro: marcado sin cobrar');
    P.push(cob.enviado ? { t: 'Cobrado', ap: 'estancia', e: 'ok', txt: 'Cobrado', cq: cuandoQuien(cob.b), marca: { txt: 'Deshacer: cobrado', tipo: 'cobrado_no' } }
      : { t: 'Cobrado', ap: 'estancia', e: liq.enviado ? 'ahora' : 'pend', txt: 'Pendiente', cq: '',
          marca: liq.enviado ? { txt: 'Marcar cobrado', tipo: 'cobrado' } : null, sig: liq.enviado ? 'Marcar el cobro de la liquidación' : '' });
    // 10. Fianza al liquidar (solo si se pagó): se descuenta en la liquidación o se devuelve después
    if (!sinFz && fz.pagada) {
      var fd = ultimaNota(r, ['Fianza descontada', 'Fianza devuelta', 'Devolver fianza', 'Fianza: marca deshecha', 'Fianza: no llegó']);
      var fdA = fd && fd.accion.indexOf('Fianza: marca deshecha') !== 0 ? fd.accion : '';
      var deshacerFd = { txt: 'Deshacer', tipo: 'fianza_devolucion_no' };
      if (fdA.indexOf('Fianza descontada') === 0) P.push({ t: 'Fianza al liquidar', ap: 'estancia', e: 'ok', txt: 'Descontada en la liquidación', cq: cuandoQuien(fd), marca: deshacerFd });
      else if (fdA.indexOf('Fianza devuelta') === 0) P.push({ t: 'Fianza al liquidar', ap: 'estancia', e: 'ok', txt: 'Devuelta', cq: cuandoQuien(fd), marca: deshacerFd });
      else if (fdA.indexOf('Devolver fianza') === 0) P.push({ t: 'Fianza al liquidar', ap: 'estancia', e: 'aviso', txt: 'Pendiente de devolver', cq: cuandoQuien(fd),
        marcas: [{ txt: 'Marcar fianza devuelta', tipo: 'fianza_devuelta' }, deshacerFd], sig: 'Devolver la fianza' });
      else P.push({ t: 'Fianza al liquidar', ap: 'estancia', e: empezo ? 'ahora' : 'pend', txt: empezo ? 'Decidir al liquidar' : 'Se decide al liquidar', cq: '',
        marcas: empezo ? [{ txt: 'Todo revisado: descontarla', tipo: 'fianza_descontada' }, { txt: 'Falta revisar: devolverla después', tipo: 'fianza_por_devolver' }] : [] });
    }
    return P;
  }

  function enviarEnlaceForm(r) {
    if (S.sinConexion) return toast('Sin conexión.', true);
    cargando(true);
    usarDB(function () { return DB.prepararFormulario(r.id); })
      .then(function (d) { cargando(false); compartirEnlace(reserva(r.id) || r, d.enlace); })
      .catch(function (e) { cargando(false); toast(e.message, true); });
  }
  function enviarContrato(r) {
    if (S.sinConexion) return toast('Sin conexión.', true);
    var h = calcularHoja(r);
    // 2.5.1: sin importe se envían igual (el presupuesto llega un mes antes). 2.5.2: si no hay servicios y sí personas, se calculan antes
    var seguir = asegurarServicios(r).then(function (r2) { h = calcularHoja(r2); return true; }, function () { return true; });
    seguir.then(function (ok) {
      if (!ok) return;
      cargando(true);
      usarDB(function () { return DB.enlaceContrato(r.id, h.total); })
        .then(function (d) { cargando(false); compartirEnlace(reserva(r.id) || r, d.enlace, 'contrato'); })
        .catch(function (e) { cargando(false); toast(e.message, true); });
    });
  }
  function recordarSenal(r) {
    if (S.sinConexion) return toast('Sin conexión.', true);
    var h = calcularHoja(r);
    var pedir = (r.firma && r.firma.enlace) ? Promise.resolve({ enlace: r.firma.enlace })
      : usarDB(function () { return DB.enlaceContrato(r.id, h.total); });
    cargando(true);
    pedir.then(function (d) {
      cargando(false);
      compartirEnlace(reserva(r.id) || r, d.enlace, 'recordar_senal');
    }).catch(function (e) { cargando(false); toast(e.message, true); });
  }
  function enviarPresupuestoActualizado(r) {
    if (S.sinConexion) return toast('Sin conexión.', true);
    var h = calcularHoja(r);
    var seguir = h.total > 0 ? Promise.resolve(true)
      : confirmar('La hoja de estancia de esta reserva no tiene importe (no hay servicios). ¿Enviar el presupuesto actualizado igualmente?', 'Enviar igualmente');
    seguir.then(function (ok) {
      if (!ok) return;
      cargando(true);
      usarDB(function () { return DB.actualizarPresupuesto(r.id, h.total); })
        .then(function (d) { cargando(false); compartirEnlace(reserva(r.id) || r, d.enlace, 'presupuesto_actualizado'); })
        .catch(function (e) { cargando(false); toast(e.message, true); });
    });
  }
  function verComprobante(r) {
    if (S.sinConexion) return toast('Sin conexión.', true);
    var w = window.open('', '_blank');
    if (w) { try { w.document.title = 'Cargando comprobante…'; w.document.body.innerHTML = '<p style="font:15px Arial,sans-serif;padding:24px;color:#555">Cargando el comprobante…</p>'; } catch (e) {} }
    cargando(true);
    usarDB(function () { return DB.verComprobante(r.id); }).then(function (d) {
      cargando(false);
      var bin = atob(d.base64 || ''), arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      var blob = new Blob([arr], { type: d.mime || 'application/pdf' });
      var url = URL.createObjectURL(blob);
      if (w && !w.closed) {
        w.location.replace(url);
      } else {
        var a = document.createElement('a'); a.href = url; a.target = '_blank'; a.download = d.nombre || 'comprobante';
        document.body.appendChild(a); a.click(); a.remove();
      }
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }).catch(function (e) {
      cargando(false);
      if (w && !w.closed) w.close();
      toast(e.message || 'No se pudo abrir el comprobante.', true);
    });
  }

  // ---------------- 2.0.0 · Contrato (ver / imprimir, firmado o vista previa) ----------------
  function htmlContrato(d) {
    var doc = d.documento || {}, c = doc.consentimiento || {}, casa = d.casa || {};
    var cuerpo = (doc.bloques || []).map(function (b) {
      var x = esc(b.x);
      return b.t === 'h' ? '<h3 class="ct-h">' + x + '</h3>' : b.t === 'c' ? '<h4 class="ct-c">' + x + '</h4>' : b.t === 'd' ? '<p class="ct-d">' + x + '</p>' : '<p>' + x + '</p>';
    }).join('');
    // 2.5.3: el presupuesto resumido va al principio (un solo PDF con presupuesto y condiciones)
    var R = doc.presupuesto, pp = R && R.personas, nP = pp ? pp.adultos + pp.ninos + pp.bebes : 0;
    var pre = nP ? '<h3 class="ct-h">PRESUPUESTO</h3><p><b>' + nP + (nP === 1 ? ' persona' : ' personas') + '</b> · ' + pp.adultos + (pp.adultos === 1 ? ' adulto' : ' adultos') + ' · ' + pp.ninos + (pp.ninos === 1 ? ' niño' : ' niños') + ' · ' + pp.bebes + (pp.bebes === 1 ? ' bebé' : ' bebés') + '</p>' +
      '<table style="width:100%;border-collapse:collapse;margin:4px 0">' + (R.lineas || []).map(function (l) { return '<tr><td style="padding:3px 0">' + esc(l.txt) + '</td><td style="text-align:right">' + euros(l.imp) + '</td></tr>'; }).join('') +
      '<tr><td style="padding:3px 0;border-top:1px solid #999"><b>Total previsto</b></td><td style="text-align:right;border-top:1px solid #999"><b>' + euros(R.total) + '</b></td></tr>' +
      '<tr><td style="padding:3px 0">Total por persona' + (R.pagantes !== nP ? ' (entre ' + R.pagantes + ' que pagan)' : '') + '</td><td style="text-align:right">' + (R.pagantes ? euros(R.porPersona) : '—') + '</td></tr></table>' +
      '<p><small>Es una estimación. Un mes antes se actualizará este presupuesto.</small></p>' : '';
    var firmaSvg = d.firma ? '<svg class="ct-firma" viewBox="0 0 600 200" preserveAspectRatio="xMidYMid meet"><path d="' + esc(d.firma) + '" fill="none" stroke="#123" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '<div class="ct-firma vacia"></div>';
    return '<div class="hoja-doc contrato-doc">' + pre + cuerpo +
      '<h3 class="ct-h">INFORMACIÓN ' + (c.basico ? 'COMPLETA ' : '') + 'SOBRE PROTECCIÓN DE DATOS</h3>' + String(c.datos || '').split(/\n+/).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
      (c.imagenes ? '<p><b>' + (d.firmado && d.imagenes ? '☑' : '☐') + '</b> ' + esc(c.imagenes) + '</p>' : '') +
      (c.comunicaciones ? '<p><b>' + (d.firmado && (d.comunicaciones || doc.comunicaciones) ? '☑' : '☐') + '</b> ' + esc(c.comunicaciones) + '</p>' : '') +
      (c.autorizacion ? '<p><b>Declaración:</b> ' + esc(c.autorizacion) + '</p>' : '') +
      '<div class="ct-firmas"><div><small>Por el prestador del servicio</small><div class="ct-firma vacia"></div><b>' + esc(casa.firmante || '') + '</b><br>' + esc(casa.cargo || '') + '</div>' +
      '<div><small>Por el cliente</small>' + firmaSvg + '<b>' + esc(d.nombre || '') + '</b>' + (d.dni ? '<br>DNI ' + esc(d.dni) : '') + (d.cargo ? ' · ' + esc(d.cargo) : '') +
      (d.firmado ? '<br><small>Firmado electrónicamente el ' + esc(marcaLegible(d.firmadoEl)) + '</small>' : '') + '</div></div></div>';
  }
  function pintarContrato(id) {
    var r = reserva(id);
    var dest = destinoTrabajo(id, 'condiciones');
    if (!r) { vista.innerHTML = botonVolver() + '<div class="vacio">La reserva no existe.</div>'; enlazarVolver(null, dest, true); return; }
    vista.innerHTML = '<div class="vacio">Cargando el contrato…</div>';
    cargando(true);
    usarDB(function () { return DB.verContrato(r.id, r.firma && r.firma.importe ? undefined : calcularHoja(r).total); }).then(function (d) {
      cargando(false);
      vista.innerHTML = '<div class="hoja-barra"><div class="fila-btns">' + (!d.firmado ? '<button class="btn sec" id="ctEnviar">Enviar para aceptar</button>' : '') +
        '<button class="btn" id="ctPdf">Imprimir / PDF</button></div>' +
        (d.firmado ? '<p class="sub" style="margin:8px 0 0">Aceptado y firmado por <b>' + esc(d.nombre) + '</b> el ' + esc(marcaLegible(d.firmadoEl)) + '.</p>'
          : '<p class="sub" style="margin:8px 0 0">Vista previa: el grupo aún no lo ha aceptado.' + (d.incompleto ? ' <b>Falta completar el texto de las condiciones en Administración › Contrato.</b>' : '') + '</p>') + '</div>' +
        '<div class="hoja-marco">' + htmlContrato(d) + '</div>';
      enlazarVolver(null, dest, true);
      if ($('#ctEnviar')) $('#ctEnviar').onclick = function () { enviarContrato(r); };
      $('#ctPdf').onclick = function () {
        var t = document.title; document.title = 'Condiciones · ' + r.grupo;
        document.body.classList.add('imprimiendo-hoja'); window.print();
        setTimeout(function () { document.body.classList.remove('imprimiendo-hoja'); document.title = t; }, 800);
      };
    }).catch(function (e) { cargando(false); vista.innerHTML = '<div class="vacio">' + esc(e.message) + '</div>'; enlazarVolver(null, dest, true); });
  }

  /** 2.5.0: al cancelar una reserva con fianza pagada, se anota qué pasa con ella. */
  function preguntarFianzaAlCancelar(r, despues) {
    if (r.pagaFianza === 'No' || !senalPagada(r).pagada) return despues();
    modal('<p><b>¿Qué pasa con la fianza?</b></p>' +
      '<div class="fila-btns" style="flex-direction:column;align-items:stretch">' +
      '<button class="btn" data-r="fianza_por_devolver">Hay que devolverla</button>' +
      '<button class="btn sec" data-r="fianza_devuelta">Ya está devuelta</button>' +
      '<button class="btn borde" data-r="fianza_no_pagada">No llegó a pagarla</button></div>' +
      '<p class="sub" style="margin-top:10px">Después, envía al grupo el mensaje de cancelación.</p>', function (e, cerrar) {
      var b = e.target.closest('[data-r]'); if (!b) return;
      cerrar();
      usarDB(function () { return DB.anotar(r.id, b.dataset.r, ''); })
        .then(function () { toast('Anotado en la bitácora'); }).catch(function (er) { toast(er.message, true); }).then(despues);
    });
  }
  function anotar(r, tipoNota, texto, ok) {
    if (S.sinConexion) return toast('Sin conexión.', true);
    cargando(true);
    usarDB(function () { return DB.anotar(r.id, tipoNota, texto); })
      .then(function () { if (ok) toast(ok); pintar(); })
      .catch(function (e) { toast(e.message, true); }).then(function () { cargando(false); });
  }

  /** Bitácora: texto corto para cada anotación. */
  function textoBitacora(b) {
    var a = b.accion;
    if (a === 'Crear') return 'Reserva creada (' + ((b.detalle.split(' · ').pop()) || '').toLowerCase() + ')';
    if (a === 'Modificar') return 'Datos de la reserva cambiados';
    if (a === 'Servicios') return 'Servicios y datos guardados';
    if (a === 'Cancelar') return 'Reserva cancelada';
    if (a === 'Nota') return '📝 ' + b.detalle;
    if (a === 'Reparto de habitaciones') return 'Reparto de habitaciones guardado (' + b.detalle + ')';
    if (a === 'Formulario aplicado') return 'Formulario aplicado a la reserva';
    if (a === 'Aviso provisional') return 'Aviso de provisional enviado a la casa';
    if (a === 'Aviso señal') return 'Aviso de fianza pendiente enviado a la casa';
    if (a === 'Aviso formulario') return 'Aviso para enviar el formulario enviado a la casa';
    if (a === 'Comprobante de señal') return 'Comprobante de la fianza recibido (' + b.detalle + ')';
    if (/^Firma: /.test(a)) return a + (b.detalle ? ' · ' + b.detalle : '');
    return a.replace(/^Formulario: /, 'Formulario: ');
  }

  /** 2.3.0: Día de la semana, fecha y hora (p. ej. «viernes 27/11/2026, 18:00»). */
  function fechaCompleta(f, h) {
    if (!f) return '—';
    var sem = aFecha(f).toLocaleDateString('es-ES', { weekday: 'long' });
    return sem + ' ' + legible(f) + (h ? ', ' + h : '');
  }
  /** 2.3.0: Resumen de personas (adultos y niños) de una reserva. */
  function textoPersonas(r) {
    var adMax = 0, niMax = 0, beMax = 0;
    var fDat = r.formulario && r.formulario.datos;
    (r.servicios || []).forEach(function (x) {
      if (SALAS.indexOf(x.servicio) < 0) {
        adMax = Math.max(adMax, x.adultos || 0);
        niMax = Math.max(niMax, x.ninos || 0);
        beMax = Math.max(beMax, x.bebes || 0);
      }
    });
    if (!adMax && !niMax && !beMax && fDat && fDat.personas) {
      adMax = fDat.personas.adultos || 0;
      niMax = fDat.personas.ninos || 0;
      beMax = fDat.personas.bebes || 0;
    }
    var ninosTot = niMax + beMax;
    if (adMax || ninosTot) {
      var tot = r.personas || (adMax + ninosTot);
      var des = [adMax + ' adulto' + (adMax === 1 ? '' : 's')];
      if (ninosTot) des.push(ninosTot + ' niño' + (ninosTot === 1 ? '' : 's'));
      return tot + ' (' + des.join(' · ') + ')';
    }
    return (r.personas || 0) + ' persona' + ((r.personas || 0) === 1 ? '' : 's');
  }

  /** 2.4.0: FICHA (reserva/ID): tarjeta de resumen para consultar y barra inferior con Siguiente paso + Volver / Gestionar. */
  function pintarDetalle(id) {
    var r = reserva(id);
    var origen = S.origenFicha || 'calendario';
    if (!r) { vista.innerHTML = botonVolver() + '<div class="vacio">La reserva no existe.</div>'; enlazarVolver(null, origen, true); return; }
    var q = ruta().q || {};
    // Los enlaces con ?abrir=apartado (p. ej. desde los correos de aviso) abren directamente Gestionar con ese apartado desplegado
    if (q.abrir) { location.replace('#/gestionar/' + encodeURIComponent(r.id) + '?abrir=' + encodeURIComponent(q.abrir)); return; }
    $('#tituloVista').textContent = r.grupo;
    var tel = String(r.telefono || '').replace(/[^\d+]/g, '');
    var bloq = tipo(r) === 'Bloqueo', canc = r.estado === 'Cancelada', aloj = tipo(r) === 'Alojamiento';
    var pasos = (bloq || canc) ? [] : pasosReserva(r, 'ficha');
    var sig = pasos.filter(function (p) { return p.sig && p.e !== 'ok' && !p.espera; })[0];
    var idq = encodeURIComponent(r.id);

    var estHtml = canc ? '<span class="etiqueta cancelada">Cancelada</span>'
      : bloq ? '<span class="etiqueta tipo">Bloqueo</span>'
      : r.estado === 'Provisional' ? '<span class="etiqueta provisional">Provisional</span>'
      : '<span class="etiqueta">Confirmada</span>';

    var nNoches = noches(r);
    var respHtml = String(r.responsable || '').trim() ? esc(r.responsable) : '<b class="hf-rojo">Falta</b>';
    var telHtml = String(r.telefono || '').trim() ? (tel ? '<a href="tel:' + esc(tel) + '">' + esc(r.telefono) + '</a>' : esc(r.telefono)) : '<b class="hf-rojo">Falta</b>';
    var mailHtml = String(r.email || '').trim() ? '<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>' : '<b class="hf-rojo">Falta</b>';

    var nHabs = (r.asignaciones || []).length;
    var persHabTxt = esc(textoPersonas(r)) + (aloj && nHabs ? ' · ' + nHabs + ' hab. (' + pernoctan(r) + ' pernoctan)' : '');

    var fDat = r.formulario && r.formulario.datos;
    var aler = (r.alergias && r.alergias.length) ? r.alergias : ((fDat && fDat.alergias) || []);
    var alerHtml = aler.length
      ? '<span class="ficha-ambar">' + aler.length + (aler.length === 1 ? ' persona' : ' personas') + '</span>'
      : 'Sin alergias';

    var fz = senalPagada(r), fi = r.firma;
    var senalHtml = r.pagaFianza === 'No' ? 'No paga' : fz.pagada ? '<span class="ficha-ok">Pagada</span>'
      : (fi && fi.comprobante) ? '<span class="ficha-ambar">Comprobante recibido</span>'
      : 'Pendiente';

    var nPend = pasos.filter(function (p) { return p.e !== 'ok'; }).length;
    var faltaHtml = nPend ? '<span class="ficha-ambar">' + nPend + (nPend === 1 ? ' paso' : ' pasos') + '</span>'
      : '<span class="ficha-ok">Completa</span>';

    vista.innerHTML =
      '<div class="tarjeta ficha-res ' + clases(r) + '">' +
        '<div class="ficha-cab"><h2>' + esc(r.grupo) + '</h2>' + estHtml + '</div>' +
        '<div class="dato"><span>Entrada:</span><span>' + esc(fechaCompleta(r.entrada, r.horaEntrada)) + '</span></div>' +
        '<div class="dato"><span>Salida:</span><span>' + esc(fechaCompleta(r.salida, r.horaSalida)) + '</span></div>' +
        (aloj ? '<div class="dato"><span>Noches</span><span>' + nNoches + (nNoches === 1 ? ' noche' : ' noches') + '</span></div>' : '') +
        (!bloq ? (
          '<div class="dato"><span>Responsable</span><span>' + respHtml + '</span></div>' +
          '<div class="dato"><span>Teléfono</span><span>' + telHtml + '</span></div>' +
          '<div class="dato"><span>Correo</span><span>' + mailHtml + '</span></div>' +
          '<div class="dato"><span>Personas' + (aloj && nHabs ? ' y hab.' : '') + '</span><span>' + persHabTxt + '</span></div>' +
          '<div class="dato"><span>Alergias</span><span>' + alerHtml + '</span></div>' +
          '<div class="dato"><span>Fianza</span><span>' + senalHtml + '</span></div>' +
          (!canc ? '<div class="dato"><span>Falta:</span><span>' + faltaHtml + '</span></div>' : '')
        ) : '') +
        (r.observaciones ? '<div class="dato"><span>Observaciones</span><span>' + esc(r.observaciones) + '</span></div>' : '') +
      '</div>' +
      '<div class="pie-form pie-ficha">' +
        (!bloq && !canc && sig ? '<button type="button" class="btn ancho pie-ficha-sig" id="dSig">Siguiente paso: ' + esc(sig.sig) + '</button>' : '') +
        '<div class="pie-ficha-nav">' +
          '<button type="button" class="btn borde js-volver">‹ Volver</button>' +
          '<button type="button" class="btn sec" id="dIrGestionar">Gestionar</button>' +
        '</div>' +
      '</div>';

    enlazarVolver(null, origen, true);
    if ($('#dSig')) $('#dSig').onclick = function () {
      if (sig.ap === 'condiciones' && sig.sig === 'Comprobar la fianza') {
        ir('gestionar/' + idq + '?abrir=condiciones');
        if (sig.acc) sig.acc.fn();
        return;
      }
      if (sig.acc && !sig.sigMarca) return sig.acc.fn();
      if (sig.sigMarca === '' && sig.acc) return sig.acc.fn();
      if (sig.sigMarca) return anotar(r, sig.sigMarca, '', 'Anotado');
      if (sig.marca) return anotar(r, sig.marca.tipo, '', 'Anotado');
    };
    $('#dIrGestionar').onclick = function () { ir('gestionar/' + idq); };
  }

  /** 2.3.0: GESTIONAR (gestionar/ID): apartados plegables, Evolución, Bitácora plegada y Cancelar o borrar. «‹ Volver» regresa a la ficha. */
  function pintarGestionar(id) {
    var r = reserva(id);
    if (!r) { vista.innerHTML = botonVolver() + '<div class="vacio">La reserva no existe.</div>'; enlazarVolver(null, S.origenFicha || 'calendario', true); return; }
    $('#tituloVista').textContent = 'Gestionar · ' + r.grupo;
    var q = ruta().q || {};
    var tel = String(r.telefono || '').replace(/[^\d+]/g, '');
    var bloq = tipo(r) === 'Bloqueo', canc = r.estado === 'Cancelada', aloj = tipo(r) === 'Alojamiento';
    var pasos = (bloq || canc) ? [] : pasosReserva(r, 'gestionar');
    var ICON = { ok: '✓', ahora: '●', aviso: '!', pend: '○' };
    function botonesPaso(p, i) {
      var btns = [];
      if (!p) return '';
      if (p.acc) btns.push('<button class="btn sec" data-p="' + i + '" data-k="acc">' + esc(p.acc.txt) + '</button>');
      if (p.marca) btns.push('<button class="btn sec" data-p="' + i + '" data-k="marca">' + esc(p.marca.txt) + '</button>');
      (p.marcas || []).forEach(function (m, j) { btns.push('<button class="btn sec" data-p="' + i + '" data-k="m' + j + '">' + esc(m.txt) + '</button>'); });
      return btns.length ? '<div class="fila-btns" style="margin-top:10px">' + btns.join('') + '</div>' : '';
    }
    function idxPaso(t) { for (var i = 0; i < pasos.length; i++) if (pasos[i].t === t) return i; return -1; }
    function lineaPaso(p, i) {
      return '<div class="paso-l e-' + p.e + (p.ap ? ' paso-ir" role="button" tabindex="0" data-ir="' + p.ap : '') + '"><span class="paso-i" aria-hidden="true">' + ICON[p.e] + '</span>' +
        '<div class="paso-t"><b>' + esc(p.t) + '</b> <span>' + esc(p.txt) + '</span>' + (p.cq ? '<small>' + esc(p.cq) + '</small>' : '') + '</div>' +
        (p.ap ? '<span class="paso-flecha" aria-hidden="true">›</span>' : '') + '</div>';
    }
    var bit = r.bitacora || [], verTodo = S.bitTodo === r.id, bitAbierta = S.bitAbierta === r.id || q.abrir === 'bitacora';
    var bitHtml = bit.length ? (verTodo ? bit : bit.slice(0, 5)).map(function (b) {
      return '<li><span class="bit-f">' + esc(marcaLegible(b.fecha)) + '</span><span class="bit-q">' + esc(b.gestor) + '</span><span class="bit-t">' + esc(textoBitacora(b)) + '</span></li>';
    }).join('') : '<li class="sub">Aún no hay anotaciones.</li>';
    var datos =
      '<div class="dato"><span>Tipo</span><span>' + esc(tipo(r)) + '</span></div>' +
      (!bloq ? '<div class="dato"><span>Responsable</span><span>' + esc(r.responsable || '—') + '</span></div>' +
        '<div class="dato' + (!r.telefono ? ' falta-tel' : '') + '"><span>Teléfono</span><span>' + (tel ? '<a href="tel:' + esc(tel) + '">' + esc(r.telefono) + '</a>' : 'Sin teléfono') + '</span></div>' +
        '<div class="dato' + (!r.email ? ' falta-email' : '') + '"><span>Email</span><span>' + (r.email ? '<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>' : 'Sin email') + '</span></div>' : '') +
      (aloj ? '<div class="dato"><span>Personas</span><span>' + (r.personas || 0) + ' · pernoctan ' + pernoctan(r) + '</span></div>' : '') +
      (r.observaciones ? '<div class="dato"><span>Observaciones</span><span>' + esc(r.observaciones) + '</span></div>' : '') +
      (r.estado === 'Provisional' && !bloq ? '<div class="dato"><span>Aviso a 1 mes</span><span>' + (r.avisoEnviado ? 'Enviado el ' + esc(r.avisoEnviado) : 'Pendiente') + '</span></div>' : '') +
      '<p class="sub" style="margin:8px 0 0;font-size:12px">Creada por ' + esc(r.creadoPor || '—') + entreParen(marcaLegible(r.creadoEl)) +
      (r.modificadoPor && (marcaLegible(r.modificadoEl) !== marcaLegible(r.creadoEl) || r.modificadoPor !== r.creadoPor)
        ? ' · Modificada por ' + esc(r.modificadoPor) + entreParen(marcaLegible(r.modificadoEl)) : '') + '</p>' +
      '<div class="fila-btns" style="margin-top:10px">' + (tel && !canc ? '<a class="btn sec" href="tel:' + esc(tel) + '">Llamar</a>' : '') +
      (!canc ? '<button class="btn sec" id="dEditar">Editar datos</button>' : '') + '</div>' +
      (pasos[0] && pasos[0].acc ? botonesPaso(pasos[0], 0) : '');
    function apartado(clave, titulo, resumen, cuerpo, abierto) {
      return '<details class="apartado" data-ap="' + clave + '"' + (q.abrir === clave || abierto ? ' open' : '') + '><summary><b>' + titulo + '</b><span>' + resumen + '</span></summary><div class="ap-cuerpo">' + cuerpo + '</div></details>';
    }
    var iCond = idxPaso('Condiciones'), iSen = idxPaso('Fianza'), iForm = idxPaso('Formulario'), iLiq = idxPaso('Liquidación'), iCob = idxPaso('Cobrado'), iFzL = idxPaso('Fianza al liquidar');
    function lineaAp(i, nombre) { return i < 0 ? '' : '<p class="sub" style="margin:14px 0 0"><b>' + nombre + ':</b> ' + esc(pasos[i].txt) + (pasos[i].cq ? ' · <small>' + esc(pasos[i].cq) + '</small>' : '') + '</p>' + botonesPaso(pasos[i], i); }
    var fTarjeta = (!bloq && !canc) ? tarjetaFormulario(r).replace(/^<div class="tarjeta"><h2>Formulario del grupo<\/h2>/, '').replace(/<\/div>$/, '') : '';
    var condResumen = iCond >= 0 ? pasos[iCond].txt + (iSen >= 0 ? ' · Fianza ' + pasos[iSen].txt.toLowerCase() : (r.pagaFianza === 'No' ? ' · Sin fianza' : '')) : '';
    var condCuerpo = iCond >= 0 ? (
      '<p class="sub" style="margin:0"><b>Firma:</b> ' + esc(pasos[iCond].txt) + (pasos[iCond].cq ? ' · <small>' + esc(pasos[iCond].cq) + '</small>' : '') + '</p>' +
      '<p class="sub" style="margin:6px 0 0;font-size:13px">El grupo recibe un enlace para ver el presupuesto, aceptar las condiciones y firmar. ' + (r.pagaFianza === 'No' ? 'Este grupo no paga fianza: la reserva se confirma al aplicar su formulario.' : 'El pago de la fianza confirma la reserva.') + '</p>' +
      botonesPaso(pasos[iCond], iCond) +
      lineaAp(iSen, 'Fianza')
    ) : '';
    vista.innerHTML = botonVolver() +
      // Apartados plegados (Datos → Presupuesto y condiciones → Formulario → Habitaciones → Hoja de estancia)
      apartado('datos', 'Datos de la reserva', esc(r.responsable || tipo(r)), datos) +
      (iCond >= 0 ? apartado('condiciones', r.pagaFianza === 'No' ? 'Condiciones' : 'Condiciones y fianza', esc(condResumen), condCuerpo) : '') +
      (fTarjeta ? apartado('formulario', 'Formulario del grupo', esc(iForm >= 0 ? pasos[iForm].txt : ''), fTarjeta) : '') +
      (aloj && !canc ? apartado('habitaciones', 'Habitaciones', (r.asignaciones || []).length ? pernoctan(r) + ' pers. en ' + r.asignaciones.length + ' hab.' : 'Sin reparto',
        avisoReparto(r) + plano(r.asignaciones) + '<div class="fila-btns" style="margin-top:10px"><button class="btn sec" id="dReparto">Reparto de habitaciones</button>' +
        ((r.asignaciones || []).length ? '<button class="btn sec" id="dHojaHab">Hoja de habitaciones</button>' : '') + '</div>') : '') +
      (!bloq && !canc ? apartado('estancia', 'Hoja de estancia', '', '<p class="sub" style="margin:0 0 10px">' + resumenServicios(r) + '</p>' +
        '<div class="fila-btns"><button class="btn sec" id="dServ">Servicios y datos</button><button class="btn sec" id="dHoja">Ver hoja de estancia</button></div>' +
        lineaAp(iLiq, 'Liquidación') + lineaAp(iFzL, 'Fianza') + lineaAp(iCob, 'Cobro')) : '') +
      // Evolución (solo seguimiento; al tocar una línea abre su apartado)
      (pasos.length ? '<div class="tarjeta exp-pasos"><h2>Evolución</h2>' + pasos.map(lineaPaso).join('') + '</div>' : '') +
      // Bitácora plegada con número de anotaciones
      apartado('bitacora', 'Bitácora (' + bit.length + ')', '', '<ul class="bitacora">' + bitHtml + '</ul>' +
        '<div class="fila-btns" style="margin-top:8px"><button class="btn sec" id="dNota">+ Añadir nota</button>' +
        (bit.length > 5 ? '<button class="btn borde" id="dBitTodo">' + (verTodo ? 'Ver menos' : 'Ver todo (' + bit.length + ')') + '</button>' : '') + '</div>', bitAbierta) +
      // Acciones finales (2.4: Borrar solo en reservas canceladas)
      '<details class="apartado peligro-ap"><summary><b>' + (canc ? 'Borrar la reserva' : 'Cancelar la reserva') + '</b><span></span></summary><div class="ap-cuerpo"><div class="fila-btns">' +
      (!canc ? '<button class="btn peligro" id="dCancelar">Cancelar reserva</button>' : '<button class="btn peligro borde-p" id="dBorrar">Borrar</button>') +
      '</div></div></details>';

    enlazarVolver(null, 'reserva/' + encodeURIComponent(r.id), true);
    var dBit = vista.querySelector('.apartado[data-ap="bitacora"]');
    if (dBit) dBit.addEventListener('toggle', function () { S.bitAbierta = dBit.open ? r.id : null; });
    $$('[data-p][data-k]').forEach(function (b) {
      b.onclick = function () {
        var p = pasos[+b.dataset.p], k = b.dataset.k;
        if (k === 'acc') return p.acc.fn();
        var m = k === 'marca' ? p.marca : p.marcas[+k.slice(1)];
        if (m.fn) return m.fn();
        anotar(r, m.tipo, '', 'Anotado en la bitácora');
      };
    });
    $$('.paso-ir').forEach(function (l) {
      function abrir() {
        var d = vista.querySelector('.apartado[data-ap="' + l.dataset.ir + '"]'); if (!d) return;
        d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      l.onclick = abrir;
      l.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } };
    });
    if ($('#dEditar')) $('#dEditar').onclick = function () { ir('editar/' + encodeURIComponent(r.id) + '?desde=gestionar&ap=datos'); };
    if ($('#dServ')) $('#dServ').onclick = function () { ir('servicios/' + encodeURIComponent(r.id) + '?desde=gestionar&ap=estancia'); };
    if ($('#dHoja')) $('#dHoja').onclick = function () { ir('hoja/' + encodeURIComponent(r.id) + '?modo=presupuesto&desde=gestionar&ap=estancia'); };
    if (fTarjeta) enlazarFormulario(r);
    if ($('#dReparto')) $('#dReparto').onclick = function () { ir('reparto/' + encodeURIComponent(r.id) + '?desde=gestionar&ap=habitaciones'); };
    if ($('#dHojaHab')) $('#dHojaHab').onclick = function () { ir('habitaciones/' + encodeURIComponent(r.id) + '?desde=gestionar&ap=habitaciones'); };
    if ($('#dBitTodo')) $('#dBitTodo').onclick = function () { S.bitTodo = verTodo ? null : r.id; S.bitAbierta = r.id; pintarGestionar(r.id); };
    $('#dNota').onclick = function () {
      modal('<p><b>Añadir nota a la bitácora</b></p><textarea class="entrada" id="notaTxt" maxlength="300" rows="3" placeholder="Por ejemplo: llamé al responsable; confirmará el número el lunes."></textarea>' +
        '<div class="fila-btns" style="margin-top:10px"><button class="btn borde" data-r="0">Volver</button><button class="btn" data-r="1">Guardar nota</button></div>', function (e, cerrar) {
        var b = e.target.closest('[data-r]'); if (!b) return;
        if (b.dataset.r === '0') return cerrar();
        var t = $('#notaTxt').value.trim(); if (!t) return toast('Escribe la nota.', true);
        S.bitAbierta = r.id;
        cerrar(); anotar(r, 'nota', t, 'Nota guardada');
      });
      setTimeout(function () { var t = $('#notaTxt'); if (t) t.focus(); }, 50);
    };
    function accion(nombre, texto, boton, ok, alTerminar) {
      return function () {
        if (S.sinConexion) return toast('Sin conexión: no se puede hacer ahora.', true);
        confirmar(texto, boton, true).then(function (si) {
          if (!si) return;
          cargando(true);
          usarDB(function () { return DB[nombre](r.id); }).then(function () { toast(ok); alTerminar(); })
            .catch(function (e) { toast(e.message, true); }).then(function () { cargando(false); });
        });
      };
    }
    if ($('#dCancelar')) $('#dCancelar').onclick = accion('cancelarReserva', '¿Cancelar la reserva de <b>' + esc(r.grupo) + '</b>? Se quitará del calendario y quedará marcada como cancelada en la lista de reservas.', 'Sí, cancelar', 'Reserva cancelada', function () {
      preguntarFianzaAlCancelar(r, function () { reemplazar('reserva/' + encodeURIComponent(r.id)); });
    });
    if ($('#dBorrar')) $('#dBorrar').onclick = accion('borrarReserva', '¿<b>Borrar</b> definitivamente «' + esc(r.grupo) + '»? Desaparecerá de la app, de la lista de reservas y del calendario. <b>No se puede deshacer.</b>', 'Sí, borrar', 'Reserva borrada', function () {
      S.origenFicha = 'reservas';
      reemplazar('reservas');
    });
  }

  // ---------------- Formulario ----------------
  function pintarFormulario(id, q) {
    q = q || {};
    var aj = (S.datos && S.datos.ajustes) || {};
    var r = id ? reserva(id) : null;
    var destVolver = id ? destinoTrabajo(id, 'datos') : (S.origenFicha || 'calendario');
    if (id && !r) { vista.innerHTML = botonVolver() + '<div class="vacio">La reserva no existe.</div>'; enlazarVolver(null, destVolver, true); return; }
    var claveBorrador = 'borrador:' + (id || 'nueva');
    var borrador = lsGet(claveBorrador);
    var fBase = r ? JSON.parse(JSON.stringify(r)) : {
      tipo: 'Alojamiento', grupo: '', responsable: '', telefono: '', email: '', entrada: q.fecha || '', horaEntrada: aj.horaEntrada || '12:00',
      salida: q.salida || (q.fecha ? sumaDias(q.fecha, 2) : ''), horaSalida: aj.horaSalida || '16:00', estado: 'Provisional', observaciones: '', personas: '', asignaciones: []
    };
    var f = JSON.parse(JSON.stringify(fBase));
    var recuperado = false;
    if (borrador && borrador.f && (!q.fecha || borrador.f.entrada === q.fecha)) { f = borrador.f; recuperado = true; }
    f.tipo = f.tipo || 'Alojamiento';
    var asig = {}; (f.asignaciones || []).forEach(function (a) { asig[a.habitacion] = a.personas; });
    var habs = habitaciones().slice().sort(function (a, b) { return a.numero - b.numero; });
    var estado = f.estado === 'Confirmada' ? 'Confirmada' : 'Provisional';
    var porConfirmar = !!(r && q.confirmar && r.estado === 'Provisional');
    if (porConfirmar) estado = 'Confirmada';
    var tipoSel = TIPOS.indexOf(f.tipo) >= 0 ? f.tipo : 'Alojamiento';
    var pagaFianza = f.pagaFianza === 'No' ? 'No' : 'Sí';  // 2.5.0: fianza opcional

    function huellaForm(d, asigMap) {
      var t = TIPOS.indexOf(d.tipo) >= 0 ? d.tipo : 'Alojamiento';
      var est = t === 'Bloqueo' ? 'Confirmada' : (d.estado === 'Confirmada' ? 'Confirmada' : 'Provisional');
      var as = t !== 'Alojamiento' ? [] : Object.keys(asigMap).filter(function (k) { return asigMap[k] > 0; }).sort(function (a, b) { return +a - +b; }).map(function (k) { return +k + ':' + asigMap[k]; });
      return JSON.stringify([t, String(d.grupo || '').trim(), String(d.responsable || '').trim(), formatoTel(d.telefono), String(d.email || '').trim(),
        d.entrada || '', d.horaEntrada || '12:00', d.salida || '', d.horaSalida || '16:00', est, String(d.observaciones || '').trim(), String(d.personas || ''), as.join(','), d.pagaFianza === 'No' ? 'No' : 'Sí']);
    }
    var asigBase = {}; (fBase.asignaciones || []).forEach(function (a) { asigBase[a.habitacion] = a.personas; });
    var huellaBase = huellaForm(fBase, asigBase);

    vista.innerHTML = '<div id="fForm">' + botonVolver() +
      (recuperado ? '<div class="aviso-suave">Se ha recuperado lo que estabas escribiendo. <button class="enlace" id="fDescartar">Descartar</button></div>' : '') +
      (porConfirmar ? '<div class="aviso-suave">Marcada como <b>Confirmada</b>. Completa los datos que falten y pulsa <b>Guardar</b> (si no guardas, sigue provisional).</div>' : '') +
      '<div class="tarjeta"><h2>Tipo</h2><div class="segmento tres" id="fTipo">' +
      TIPOS.map(function (t) { return '<button type="button" data-t="' + t + '">' + (t === 'Bloqueo' ? 'Bloqueo / descanso' : t) + '</button>'; }).join('') + '</div>' +
      '<p class="sub" id="fTipoAyuda" style="margin:8px 0 0"></p></div>' +
      '<div class="tarjeta"><h2 id="fTitGrupo">Grupo</h2>' +
      '<label class="campo"><span id="fLblGrupo">Nombre del grupo / retiro *</span><input class="entrada" id="fGrupo" value="' + esc(f.grupo) + '" maxlength="80" autocomplete="off"></label>' +
      '<div id="fContacto">' +
      '<label class="campo sug"><span>Responsable</span><input class="entrada" id="fResp" value="' + esc(f.responsable) + '" maxlength="80" autocomplete="off"><div class="sugerencias" id="sResp" hidden></div></label>' +
      '<label class="campo"><span>Teléfono del responsable</span><input class="entrada" id="fTel" type="tel" inputmode="tel" value="' + esc(f.telefono) + '" maxlength="30" autocomplete="off"><small class="ayuda" id="aTel"></small></label>' +
      '<label class="campo sug"><span>Email</span><input class="entrada" id="fEmail" type="email" inputmode="email" value="' + esc(f.email) + '" maxlength="80" autocomplete="off"><div class="sugerencias" id="sEmail" hidden></div><small class="ayuda" id="aEmail"></small></label>' +
      '</div></div>' +
      '<div class="tarjeta"><h2>Fechas</h2>' +
      '<div class="dos"><label class="campo"><span id="fLblEnt">Entrada *</span><input class="entrada" id="fEnt" type="date" value="' + esc(f.entrada) + '"></label>' +
      '<label class="campo"><span>Hora</span><input class="entrada" id="fHEnt" type="time" value="' + esc(f.horaEntrada) + '"></label></div>' +
      '<div class="dos"><label class="campo"><span id="fLblSal">Salida *</span><input class="entrada" id="fSal" type="date" value="' + esc(f.salida) + '"></label>' +
      '<label class="campo"><span>Hora</span><input class="entrada" id="fHSal" type="time" value="' + esc(f.horaSalida) + '"></label></div>' +
      '<p class="error-txt" id="fFechasErr"></p><div class="aviso-suave" id="fSolapes" hidden></div>' +
      '<div id="fEstadoBloque"><label class="campo"><span>Estado</span></label><div class="segmento estado" id="fEstado"><button type="button" data-e="Provisional" class="b-prov">Provisional</button><button type="button" data-e="Confirmada" class="b-conf">Confirmada</button></div></div>' +
      '<div id="fFianzaBloque" style="margin-top:12px"><label class="campo"><span>¿Paga fianza?</span></label><div class="segmento" id="fFianza"><button type="button" data-f="Sí">Sí, paga fianza</button><button type="button" data-f="No">No paga</button></div><p class="sub" id="fFianzaAyuda" style="margin:6px 0 0"></p></div>' +
      '<label class="campo" id="fPersBloque" style="margin-top:12px"><span>Personas (total del grupo)</span><input class="entrada" id="fPers" type="number" inputmode="numeric" min="0" value="' + esc(f.personas || '') + '" placeholder="Si se deja vacío, se cuentan las de las habitaciones"></label>' +
      '<label class="campo" style="margin-top:12px"><span>Observaciones</span><textarea class="entrada" id="fObs" maxlength="500" placeholder="Notas, peticiones… (más adelante: alergias y dietas)">' + esc(f.observaciones) + '</textarea></label>' +
      '</div>' +
      '<div class="tarjeta" id="fHabsBloque"><h2>Habitaciones</h2><p class="sub" style="margin-top:-6px">Personas que pernoctan en cada habitación.</p>' +
      '<div class="fila-btns" style="margin-bottom:6px"><button type="button" class="btn sec" id="fAuto">Repartir automáticamente</button><button type="button" class="btn borde" id="fVaciar">Vaciar</button></div>' +
      '<div class="lista-hab" id="fHabs"></div></div>' +
      '<div class="form-espacio"></div>' +
      '<div class="pie-form"><div class="total" id="fTotal"></div><button class="btn" id="fGuardar">Guardar</button></div></div>';

    function leer() {
      return {
        id: r ? r.id : undefined, tipo: tipoSel, grupo: $('#fGrupo').value.trim(), responsable: $('#fResp').value.trim(),
        telefono: formatoTel($('#fTel').value), email: $('#fEmail').value.trim(), entrada: $('#fEnt').value,
        horaEntrada: $('#fHEnt').value || '12:00', salida: $('#fSal').value, horaSalida: $('#fHSal').value || '16:00',
        estado: tipoSel === 'Bloqueo' ? 'Confirmada' : estado, observaciones: $('#fObs').value.trim(), personas: $('#fPers').value,
        pagaFianza: tipoSel === 'Bloqueo' ? 'No' : pagaFianza
      };
    }
    S.hayCambios = function () { return huellaForm(leer(), asig) !== huellaBase; };
    function guardarBorrador() {
      var d = leer(); d.asignaciones = Object.keys(asig).filter(function (k) { return asig[k] > 0; }).map(function (k) { return { habitacion: +k, personas: asig[k] }; });
      lsSet(claveBorrador, { f: d, cuando: Date.now() });
    }
    $('#fForm').addEventListener('input', guardarBorrador);
    $('#fForm').addEventListener('change', guardarBorrador);
    if ($('#fDescartar')) $('#fDescartar').onclick = function () { lsDel(claveBorrador); pintarFormulario(id, q); };
    enlazarVolver(function () { lsDel(claveBorrador); }, destVolver, true);

    // Habitaciones ocupadas por otras reservas en las mismas fechas
    function ocupadas() {
      var d = leer(), oc = {};
      if (!d.entrada || !d.salida) return oc;
      activas().forEach(function (x) {
        if (x.id === d.id) return;
        if (momento(d.entrada, d.horaEntrada) < momento(x.salida, x.horaSalida) && momento(d.salida, d.horaSalida) > momento(x.entrada, x.horaEntrada))
          (x.asignaciones || []).forEach(function (a) { oc[a.habitacion] = x.grupo; });
      });
      return oc;
    }
    function filaHab(h, oc) {
      var p = asig[h.numero] || 0, cerrada = h.estado !== 'Disponible', otra = oc[h.numero];
      return '<div class="item' + (cerrada || otra ? ' cerrada' : '') + '" data-n="' + h.numero + '">' +
        '<div class="nom"><b>Hab. ' + h.numero + '</b><small>' + esc(h.tipo) + ' · ' + esc(h.camas) + (cerrada ? ' · CERRADA' : '') + (otra ? ' · ocupada por «' + esc(otra) + '»' : '') + '</small></div>' +
        (cerrada || otra ? '<span class="sub">No disponible</span>' :
          '<div class="paso"><button type="button" data-d="-1" aria-label="Quitar"' + (p <= 0 ? ' disabled' : '') + '>−</button>' +
          '<output class="' + (p >= h.capacidad ? 'lleno' : '') + '">' + p + '/' + h.capacidad + '</output>' +
          '<button type="button" data-d="1" aria-label="Añadir"' + (p >= h.capacidad ? ' disabled' : '') + '>+</button></div>') + '</div>';
    }
    function pintaHabs() {
      var oc = ocupadas();
      Object.keys(oc).forEach(function (k) { delete asig[k]; });
      $('#fHabs').innerHTML = habs.map(function (h) { return filaHab(h, oc); }).join('');
      pintaTotal();
    }
    function total() { return Object.keys(asig).reduce(function (s, k) { return s + (asig[k] || 0); }, 0); }
    function pintaTotal() {
      var t = total(), manual = +$('#fPers').value || 0;
      if (tipoSel === 'Bloqueo') { $('#fTotal').innerHTML = '<b>Bloqueo</b> de la casa'; return; }
      if (tipoSel === 'Día / sala') { $('#fTotal').innerHTML = '<b>' + (manual || '—') + '</b> pers. · sin aloj.'; return; }
      var p = Math.max(t, manual);
      $('#fTotal').innerHTML = '<b>' + p + '</b> pers.' + (manual && manual !== t ? ' (' + t + ' pern.)' : '') + ' · ' + capacidadDisponible() + ' plazas';
    }
    function alPulsar(e) {
      var b = e.target.closest('button[data-d]'); if (!b) return;
      var n = Number(b.closest('.item').dataset.n), h = hab(n);
      asig[n] = Math.max(0, Math.min(h.capacidad, (asig[n] || 0) + Number(b.dataset.d)));
      var el = vista.querySelector('.item[data-n="' + n + '"]'); if (el) el.outerHTML = filaHab(h, ocupadas());
      pintaTotal(); guardarBorrador();
    }
    $('#fHabs').onclick = alPulsar;
    $('#fVaciar').onclick = function () { asig = {}; pintaHabs(); guardarBorrador(); };
    $('#fAuto').onclick = function () {
      modal('<p><b>Repartir automáticamente</b><br><span class="sub">Rellena las habitaciones libres por orden.</span></p>' +
        '<label class="campo"><span>Personas que pernoctan</span><input class="entrada" id="aN" type="number" inputmode="numeric" min="1" value="' + (total() || $('#fPers').value || '') + '"></label>' +
        '<div class="fila-btns"><button class="btn borde" data-r="0">Volver</button><button class="btn" data-r="1">Repartir</button></div>',
        function (e, cerrar) {
          var b = e.target.closest('[data-r]'); if (!b) return;
          if (b.dataset.r === '1') {
            var n = Math.floor(Number($('#aN').value) || 0), oc = ocupadas();
            var libres = habs.filter(function (h) { return h.estado === 'Disponible' && !oc[h.numero]; });
            var cap = libres.reduce(function (s, h) { return s + h.capacidad; }, 0);
            if (n < 1) return;
            if (n > cap) { toast('Solo hay ' + cap + ' plazas libres en esas fechas.', true); return; }
            asig = {}; libres.forEach(function (h) { if (n <= 0) return; var p = Math.min(h.capacidad, n); asig[h.numero] = p; n -= p; });
            pintaHabs(); guardarBorrador();
          }
          cerrar();
        });
      setTimeout(function () { $('#aN') && $('#aN').focus(); }, 50);
    };

    // Tipo y estado
    function pintaTipo() {
      $$('#fTipo button').forEach(function (b) { b.classList.toggle('activo', b.dataset.t === tipoSel); });
      var bloq = tipoSel === 'Bloqueo';
      $('#fContacto').hidden = bloq; $('#fEstadoBloque').hidden = bloq;
      $('#fHabsBloque').hidden = true;  // 2.5.1: el reparto se hace en Gestionar (un mes antes); aquí solo las personas
      $('#fPersBloque').hidden = bloq; $('#fFianzaBloque').hidden = bloq;
      $('#fTitGrupo').textContent = bloq ? 'Motivo' : 'Grupo';
      $('#fLblGrupo').textContent = bloq ? 'Motivo del bloqueo (p. ej., DESCANSO)' : 'Nombre del grupo / retiro *';
      $('#fLblEnt').textContent = bloq ? 'Desde *' : 'Entrada *'; $('#fLblSal').textContent = bloq ? 'Hasta *' : 'Salida *';
      $('#fTipoAyuda').textContent = tipoSel === 'Alojamiento' ? 'Grupo que pernocta en la casa.' :
        tipoSel === 'Día / sala' ? 'Evento sin alojamiento (no usa habitaciones).' : 'Días en que la casa no se reserva: descanso, obras, etc.';
      $('#fPers').placeholder = tipoSel === 'Alojamiento' ? 'Si se deja vacío, se cuentan las de las habitaciones' : 'Opcional';
      pintaTotal(); revisarContacto();
    }
    $('#fTipo').onclick = function (e) { var b = e.target.closest('button'); if (b) { tipoSel = b.dataset.t; pintaTipo(); guardarBorrador(); } };
    function pintaEstado() { $$('#fEstado button').forEach(function (b) { b.classList.toggle('activo', b.dataset.e === estado); }); }
    $('#fEstado').onclick = function (e) { var b = e.target.closest('button'); if (b) { estado = b.dataset.e; pintaEstado(); guardarBorrador(); } };
    function pintaFianza() {
      $$('#fFianza button').forEach(function (b) { b.classList.toggle('activo', b.dataset.f === pagaFianza); });
      var imp = cfgNum('contrato.senal');
      $('#fFianzaAyuda').textContent = pagaFianza === 'No' ? 'No paga fianza: la reserva se confirma al aplicar su formulario.'
        : 'Fianza' + (imp ? ' de ' + euros(imp) : '') + ': confirma la reserva al pagarla; se descuenta en la liquidación o se devuelve.';
    }
    $('#fFianza').onclick = function (e) { var b = e.target.closest('button'); if (b) { pagaFianza = b.dataset.f; pintaFianza(); guardarBorrador(); } };
    $('#fPers').oninput = pintaTotal;

    // Contacto: formato y avisos (sin bloquear)
    function revisarContacto() {
      if (tipoSel === 'Bloqueo') return;
      var t = $('#fTel').value.trim(), m = $('#fEmail').value.trim();
      $('#aTel').textContent = !t ? 'Sin teléfono de contacto (se puede guardar igualmente).' : !telValido(t) ? 'Revisa el número: el formato habitual es 612 491 985.' : '';
      $('#aTel').className = 'ayuda' + (!t ? ' roja' : !telValido(t) ? ' naranja' : '');
      $('#fTel').classList.toggle('falta-tel', !t);
      $('#aEmail').textContent = !m ? 'Sin email (se puede guardar igualmente).' : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m) ? 'Revisa el email.' : '';
      $('#aEmail').className = 'ayuda' + (!m ? ' naranja' : '');
      $('#fEmail').classList.toggle('falta-email', !m);
    }
    $('#fTel').addEventListener('blur', function () { this.value = formatoTel(this.value); revisarContacto(); guardarBorrador(); });
    $('#fTel').addEventListener('input', revisarContacto);
    $('#fEmail').addEventListener('input', revisarContacto);

    // Autocompletar responsable y email
    var cts = contactos();
    function sugerir(input, caja, lista, texto, alElegir) {
      function mostrar() {
        var v = input.value.trim().toLowerCase();
        var ops = v.length < 1 ? [] : lista.filter(function (x) { var t = texto(x).toLowerCase(); return t.indexOf(v) >= 0 && t !== v; }).slice(0, 6);
        if (!ops.length) { caja.hidden = true; return; }
        caja.innerHTML = ops.map(function (x, i) { return '<button type="button" data-i="' + lista.indexOf(x) + '"><b>' + esc(texto(x)) + '</b>' +
          '<small>' + esc([x.telefono, x.email !== texto(x) ? x.email : x.nombre].filter(Boolean).join(' · ')) + '</small></button>'; }).join('');
        caja.hidden = false;
      }
      input.addEventListener('input', mostrar);
      input.addEventListener('focus', mostrar);
      input.addEventListener('blur', function () { setTimeout(function () { caja.hidden = true; }, 200); });
      caja.addEventListener('mousedown', function (e) { e.preventDefault(); });
      caja.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-i]'); if (!b) return;
        alElegir(lista[+b.dataset.i]); caja.hidden = true; revisarContacto(); guardarBorrador();
      });
    }
    sugerir($('#fResp'), $('#sResp'), cts.resp, function (x) { return x.nombre; }, function (x) {
      $('#fResp').value = x.nombre; if (x.telefono) $('#fTel').value = formatoTel(x.telefono); if (x.email) $('#fEmail').value = x.email;
      toast('Teléfono y email copiados de reservas anteriores');
    });
    sugerir($('#fEmail'), $('#sEmail'), cts.mails, function (x) { return x.email; }, function (x) {
      $('#fEmail').value = x.email; if (!$('#fResp').value && x.nombre) $('#fResp').value = x.nombre; if (!$('#fTel').value && x.telefono) $('#fTel').value = formatoTel(x.telefono);
    });

    // Fechas y solapes (aviso, no bloqueo)
    function revisarFechas() {
      var d = leer(), err = '';
      var sol = $('#fSolapes'); sol.hidden = true;
      if (d.entrada && d.salida) {
        if (momento(d.salida, d.horaSalida) <= momento(d.entrada, d.horaEntrada)) err = 'La salida debe ser posterior a la entrada.';
        else {
          var s = activas().filter(function (x) {
            return x.id !== d.id && momento(d.entrada, d.horaEntrada) < momento(x.salida, x.horaSalida) && momento(d.salida, d.horaSalida) > momento(x.entrada, x.horaEntrada);
          });
          if (s.length) {
            sol.innerHTML = '<b>Coincide con:</b> ' + s.map(function (x) { return esc(x.grupo) + ' (' + legible(x.entrada) + ' → ' + legible(x.salida) + ')'; }).join('; ') +
              '. Se puede guardar; solo se bloquean las habitaciones que ya estén asignadas.';
            sol.hidden = false;
          }
        }
      }
      $('#fFechasErr').textContent = err;
      if (tipoSel === 'Alojamiento') pintaHabs();
      return !err;
    }
    $('#fEnt').onchange = function () {
      if (this.value && (!$('#fSal').value || $('#fSal').value < this.value)) $('#fSal').value = tipoSel === 'Alojamiento' ? sumaDias(this.value, 2) : this.value;
      revisarFechas(); guardarBorrador();
    };
    ['#fSal', '#fHEnt', '#fHSal'].forEach(function (s) { $(s).onchange = function () { revisarFechas(); guardarBorrador(); }; });

    pintaTipo(); pintaEstado(); pintaFianza(); pintaHabs(); revisarContacto();
    if (f.entrada) revisarFechas();

    $('#fGuardar').onclick = function () {
      if (S.sinConexion) return toast('Sin conexión: no se puede guardar ahora.', true);
      var d = leer();
      if (!d.grupo && tipoSel !== 'Bloqueo') { $('#fGrupo').focus(); return toast('Indica el nombre del grupo.', true); }
      if (!d.entrada || !d.salida) return toast('Indica las fechas.', true);
      if (!revisarFechas()) { $('#fEnt').scrollIntoView({ block: 'center' }); return toast($('#fFechasErr').textContent, true); }
      var asignaciones = tipoSel !== 'Alojamiento' ? [] : Object.keys(asig).filter(function (k) { return asig[k] > 0; }).map(function (k) { return { habitacion: Number(k), personas: asig[k] }; });
      var faltan = [];
      if (tipoSel !== 'Bloqueo') { if (!d.telefono) faltan.push('teléfono'); if (!d.email) faltan.push('email'); }
      var seguir = Promise.resolve(true);  // 2.5.1: se guarda siempre; lo que falte se marca en la ficha
      seguir.then(function (ok) {
        if (!ok) return;
        cargando(true);
        usarDB(function () { return DB.guardarReserva(d, asignaciones); })
          .then(function (res) {
            lsDel(claveBorrador);
            S.hayCambios = null;
            toast((r ? 'Cambios guardados' : 'Reserva creada') + (res.solapes && res.solapes.length ? ' · coincide con: ' + res.solapes.join(', ') : ''));
            var seguirA = function () { reemplazar(r ? destVolver : ('reserva/' + encodeURIComponent(res.id))); };
            var nr = reserva(res.id);  // 2.5.2: primer presupuesto con las comidas calculadas; 2.5.4: al editar, se reajustan
            return nr ? (r ? reajustarServicios(r, nr) : asegurarServicios(nr)).catch(function () {}).then(seguirA) : seguirA();
          })
          .catch(function (e) { toast(e.message, true); })
          .then(function () { cargando(false); });
      });
    };
  }

  // ---------------- Ajustes ----------------
  // ---------------- 1.5.0 · Servicios por día y hoja de estancia ----------------
  var COMIDAS = [['Desayuno', '09:00'], ['Comida', '14:00'], ['Cena', '21:00']];
  var SALAS = ['Salón', 'Salas', 'Capilla', 'Garaje'];
  function cfg(clave) { var a = ((S.datos && S.datos.config) || []).filter(function (x) { return x.clave === clave; })[0]; return a ? String(a.valor == null ? '' : a.valor) : ''; }
  function cfgNum(clave) { var v = cfg(clave).replace(',', '.').trim(); return v === '' || isNaN(+v) ? null : +v; }
  function euros(n) { return n == null ? 'a consultar' : n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) + ' €'; }
  function diasDe(r) { var out = [], d = r.entrada; while (d <= r.salida) { out.push(d); d = sumaDias(d, 1); } return out; }
  function diaCorto(t) { var d = aFecha(t); return d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '') + ' ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1); }
  function mapaServ(r) { var m = {}; (r.servicios || []).forEach(function (x) { m[x.fecha + '|' + x.servicio] = x; }); return m; }
  function resumenServicios(r) {
    var sv = r.servicios || [];
    if (!sv.length) return 'Aún no hay servicios apuntados. Rellénalos para preparar el presupuesto.';
    var c = { Desayuno: 0, Comida: 0, Cena: 0, Noche: 0 };
    sv.forEach(function (x) { if (c[x.servicio] != null) c[x.servicio] += (x.adultos || 0) + (x.ninos || 0) + (x.bebes || 0); });
    return c.Noche + ' pernoctaciones · ' + c.Desayuno + ' desayunos · ' + c.Comida + ' comidas · ' + c.Cena + ' cenas';
  }

  function pintarServicios(id) {
    var r = reserva(id);
    var dest = destinoTrabajo(id, 'estancia');
    if (!r) { vista.innerHTML = botonVolver() + '<div class="vacio">La reserva no existe.</div>'; enlazarVolver(null, dest, true); return; }
    var dias = diasDe(r), m = mapaServ(r), g = r.grupoDatos || {};
    var aloj = tipo(r) === 'Alojamiento';
    var maxA = 0, maxN = 0, maxB = 0;
    (r.servicios || []).forEach(function (x) { maxA = Math.max(maxA, x.adultos); maxN = Math.max(maxN, x.ninos); maxB = Math.max(maxB, x.bebes); });
    if (!(r.servicios || []).length) maxA = r.personas || 0;
    function num(idc, v, lbl) { return '<label class="sv-num"><span>' + lbl + '</span><input class="entrada" type="number" inputmode="numeric" min="0" max="999" id="' + idc + '" value="' + (v ? v : '') + '" placeholder="0"></label>'; }
    function filaComida(t, nombre) {
      var x = m[t + '|' + nombre] || {};
      return '<div class="sv-fila"><b>' + nombre + '</b>' + num('a_' + t + '_' + nombre, x.adultos, 'Adultos') + num('n_' + t + '_' + nombre, x.ninos, 'Niños') +
        num('b_' + t + '_' + nombre, x.bebes, '0 a ' + (cfg('edad.gratis_hasta') || 4)) + '</div>';
    }
    var bloquesDias = dias.map(function (t, i) {
      var ultimo = i === dias.length - 1;
      return '<div class="sv-dia"><h3>' + esc(diaSemana(t)) + '</h3>' +
        COMIDAS.map(function (c) { return filaComida(t, c[0]); }).join('') +
        (aloj && !ultimo ? filaComida(t, 'Noche') : '') +
        '<div class="sv-salas">' + SALAS.map(function (sa) {
          var on = !!m[t + '|' + sa];
          return '<label class="chip' + (on ? ' activo' : '') + '"><input type="checkbox" id="s_' + t + '_' + sa + '"' + (on ? ' checked' : '') + '> ' + sa + '</label>';
        }).join('') + '</div></div>';
    }).join('');
    function campo(idc, lbl, v, extra) { return '<label class="campo"><span>' + lbl + '</span><input class="entrada" id="' + idc + '" value="' + esc(v || '') + '"' + (extra || '') + ' autocomplete="off"></label>'; }
    vista.innerHTML = botonVolver() +
      '<div class="tarjeta"><h2>' + esc(r.grupo) + '</h2><p class="sub" style="margin:-6px 0 0">' + esc(legible(r.entrada)) + ' ' + esc(r.horaEntrada) + ' → ' + esc(legible(r.salida)) + ' ' + esc(r.horaSalida) + '</p></div>' +
      '<div class="tarjeta"><h2>Personas</h2>' +
      '<div class="sv-pers">' + num('pA', maxA, 'Adultos (desde ' + (cfg('edad.adulto_desde') || 9) + ' años)') + num('pN', maxN, 'Niños de ' + ((+cfg('edad.gratis_hasta') || 4) + 1) + ' a ' + ((+cfg('edad.adulto_desde') || 9) - 1)) + num('pB', maxB, 'Niños de 0 a ' + (cfg('edad.gratis_hasta') || 4) + ' (gratis)') + '</div>' +
      '<button type="button" class="btn sec ancho" id="svAuto" style="margin-top:10px">Rellenar todos los días según el horario</button>' +
      '<p class="sub" style="margin:8px 0 0;font-size:13px">Pone estas personas en cada comida y noche que cae dentro de la estancia. Después puedes corregir cualquier día.</p></div>' +
      '<div class="tarjeta"><h2>Servicios por día</h2>' + bloquesDias + '</div>' +
      '<div class="tarjeta"><h2>Datos para los documentos</h2>' +
      campo('gEnt', 'Entidad (nombre legal)', g.entidad, ' maxlength="120"') + campo('gCif', 'CIF', g.cif, ' maxlength="30"') +
      campo('gDir', 'Dirección', g.direccion, ' maxlength="160"') + campo('gRep', 'Representante que firma', g.representante, ' maxlength="120"') +
      '<div class="dos">' + campo('gDni', 'DNI', g.dni, ' maxlength="30"') + campo('gCar', 'Cargo', g.cargo, ' maxlength="60"') + '</div>' +
      campo('gSen', 'Fianza pagada (€)', g.senal, ' inputmode="decimal" maxlength="12" placeholder="0"') + '</div>' +
      '<div class="pie-form"><div class="total" id="svTotal"></div><button class="btn" id="svGuardar">Guardar</button></div>';
    enlazarVolver(null, dest, true);
    function v(idc) { var e = document.getElementById(idc); return e ? Math.max(0, Math.floor(+e.value || 0)) : 0; }
    function leer() {
      var out = [];
      dias.forEach(function (t) {
        COMIDAS.concat([['Noche']]).forEach(function (c) {
          var a = v('a_' + t + '_' + c[0]), n = v('n_' + t + '_' + c[0]), b = v('b_' + t + '_' + c[0]);
          if (a || n || b) out.push({ fecha: t, servicio: c[0], adultos: a, ninos: n, bebes: b });
        });
        SALAS.forEach(function (sa) { var e = document.getElementById('s_' + t + '_' + sa); if (e && e.checked) out.push({ fecha: t, servicio: sa, adultos: 1, ninos: 0, bebes: 0 }); });
      });
      return out;
    }
    function leerGrupo() {
      return { entidad: $('#gEnt').value.trim(), cif: $('#gCif').value.trim(), direccion: $('#gDir').value.trim(),
        representante: $('#gRep').value.trim(), dni: $('#gDni').value.trim(), cargo: $('#gCar').value.trim(), senal: $('#gSen').value.trim() };
    }
    var huellaBase = JSON.stringify([leer(), leerGrupo()]);
    S.hayCambios = function () { return JSON.stringify([leer(), leerGrupo()]) !== huellaBase; };
    function total() {
      var c = calcularHoja({ servicios: leer(), grupoDatos: {} });
      $('#svTotal').innerHTML = 'Previsto: <b>' + euros(c.total) + '</b>' + (c.consultar ? ' <small>+ a consultar</small>' : '');
    }
    total();
    vista.oninput = function () { if ($('#svTotal')) total(); };
    $$('.sv-salas input').forEach(function (e) { e.onchange = function () { e.parentNode.classList.toggle('activo', e.checked); total(); }; });
    $('#svAuto').onclick = function () {
      var a = v('pA'), n = v('pN'), b = v('pB');
      dias.forEach(function (t, i) {
        COMIDAS.forEach(function (c) {
          var dentro = (t > r.entrada || c[1] >= r.horaEntrada) && (t < r.salida || c[1] < r.horaSalida);
          var ea = document.getElementById('a_' + t + '_' + c[0]), en = document.getElementById('n_' + t + '_' + c[0]), eb = document.getElementById('b_' + t + '_' + c[0]);
          ea.value = dentro && a ? a : ''; en.value = dentro && n ? n : ''; eb.value = dentro && b ? b : '';
        });
        var na = document.getElementById('a_' + t + '_Noche'), nn = document.getElementById('n_' + t + '_Noche'), nb = document.getElementById('b_' + t + '_Noche');
        if (na) { na.value = a || ''; nn.value = n || ''; nb.value = b || ''; }
      });
      total(); toast('Rellenado. Revisa los días y pulsa Guardar.');
    };
    $('#svGuardar').onclick = function () {
      if (S.sinConexion) return toast('Sin conexión.', true);
      var g2 = { entidad: $('#gEnt').value, cif: $('#gCif').value, direccion: $('#gDir').value, representante: $('#gRep').value, dni: $('#gDni').value, cargo: $('#gCar').value, senal: $('#gSen').value };
      cargando(true);
      usarDB(function () { return DB.guardarServicios(r.id, leer(), g2); }).then(function () { S.hayCambios = null; toast('Servicios guardados'); reemplazar(dest); })
        .catch(function (e) { toast(e.message, true); }).then(function () { cargando(false); });
    };
  }

  /** 2.5.2: comidas y noches según la hora de entrada y salida (D25). Una comida cuenta si el grupo está en la Casa a su hora. */
  function horaComida(sv) { var def = { Desayuno: '09:00', Comida: '14:00', Cena: '21:00' }[sv]; var v = cfg('hora.' + sv.toLowerCase()); return /^\d{2}:\d{2}$/.test(v) ? v : def; }
  function serviciosCalculados(r, ad, ni, be) {
    var ini = momento(r.entrada, r.horaEntrada || '12:00'), fin = momento(r.salida, r.horaSalida || '16:00'), out = [];
    if (!(ad + ni + be) || !(fin > ini)) return out;
    diasDe(r).forEach(function (d) {
      ['Desayuno', 'Comida', 'Cena'].forEach(function (sv) { var m = momento(d, horaComida(sv)); if (m >= ini && m <= fin) out.push({ fecha: d, servicio: sv, adultos: ad, ninos: ni, bebes: be }); });
      if (tipo(r) === 'Alojamiento' && d < r.salida) out.push({ fecha: d, servicio: 'Noche', adultos: ad, ninos: ni, bebes: be });
    });
    return out;
  }
  /** 2.5.2: si la reserva tiene personas y aún no tiene servicios, se calculan y se guardan (primer presupuesto). */
  function asegurarServicios(r) {
    var p = Number(r.personas) || 0;
    if (!r || (r.servicios || []).length || !p || tipo(r) === 'Bloqueo' || (r.formulario && r.formulario.estado === 'Aplicado')) return Promise.resolve(r);
    var lista = serviciosCalculados(r, p, 0, 0);
    if (!lista.length) return Promise.resolve(r);
    return usarDB(function () { return DB.guardarServicios(r.id, lista, {}); }).then(function () { return reserva(r.id) || r; });
  }
  /** 2.5.4: al cambiar fechas, horas o personas de una reserva que ya tiene comidas, manda lo último guardado:
      las comidas que ya estaban se quedan como estaban (también las quitadas), las nuevas que entran por las fechas se añaden
      con todo el grupo, las que quedan fuera se borran, y si cambian las personas se suman o restan a los adultos
      en las comidas que tenían a todo el grupo. */
  function reajustarServicios(antes, r) {
    if (!antes || !r || tipo(r) === 'Bloqueo') return Promise.resolve(r);
    var sv = r.servicios || [];
    if (!sv.length) return asegurarServicios(r);
    var COM = ['Desayuno', 'Comida', 'Cena', 'Noche'];
    function esComida(x) { return COM.indexOf(x.servicio) >= 0; }
    function tot(x) { return (x.adultos || 0) + (x.ninos || 0) + (x.bebes || 0); }
    var cambiaFechas = antes.entrada !== r.entrada || antes.salida !== r.salida || (antes.horaEntrada || '12:00') !== (r.horaEntrada || '12:00') ||
      (antes.horaSalida || '16:00') !== (r.horaSalida || '16:00') || tipo(antes) !== tipo(r);
    var dif = (Number(r.personas) || 0) - (Number(antes.personas) || 0);
    if (!cambiaFechas && !dif) return Promise.resolve(r);
    var viejos = {}, nuevos = {};
    serviciosCalculados(antes, 1, 0, 0).forEach(function (h) { viejos[h.fecha + '|' + h.servicio] = true; });
    serviciosCalculados(r, 1, 0, 0).forEach(function (h) { nuevos[h.fecha + '|' + h.servicio] = true; });
    var pax = { a: 0, n: 0, b: 0 };
    sv.filter(esComida).forEach(function (x) { pax.a = Math.max(pax.a, x.adultos || 0); pax.n = Math.max(pax.n, x.ninos || 0); pax.b = Math.max(pax.b, x.bebes || 0); });
    var grupo = pax.a + pax.n + pax.b;
    if (dif) pax.a = Math.max(0, pax.a + dif);
    var lista = [], hay = {};
    sv.forEach(function (x) {
      var y = { fecha: x.fecha, servicio: x.servicio, adultos: x.adultos || 0, ninos: x.ninos || 0, bebes: x.bebes || 0 };
      if (esComida(x)) {
        if (!nuevos[x.fecha + '|' + x.servicio]) return;  // queda fuera de las fechas nuevas
        if (dif && tot(x) === grupo) y.adultos = Math.max(0, y.adultos + dif);
        if (!tot(y)) return;
        hay[x.fecha + '|' + x.servicio] = true;
      } else if (x.fecha < r.entrada || x.fecha > r.salida) return;
      lista.push(y);
    });
    if (pax.a + pax.n + pax.b) Object.keys(nuevos).forEach(function (k) {
      if (viejos[k] || hay[k]) return;  // las que ya existían (o estaban quitadas) no se tocan
      var p = k.split('|'); lista.push({ fecha: p[0], servicio: p[1], adultos: pax.a, ninos: pax.n, bebes: pax.b });
    });
    return usarDB(function () { return DB.guardarServicios(r.id, lista, {}); }).then(function () { return reserva(r.id) || r; });
  }
  function calcularHoja(r) {
    var sv = r.servicios || [], suma = {};
    sv.forEach(function (x) { var k = x.servicio; suma[k] = suma[k] || { a: 0, n: 0, b: 0, dias: 0 }; suma[k].a += x.adultos; suma[k].n += x.ninos; suma[k].b += (x.bebes || 0); suma[k].dias++; });
    var lineas = [];
    function lin(txt, u, precio) { if (u > 0) lineas.push({ txt: txt, u: u, p: precio, imp: precio == null ? null : Math.round(u * precio * 100) / 100 }); }
    [['Desayuno', 'desayuno', 'Desayuno'], ['Comida', 'comida', 'Comida'], ['Cena', 'cena', 'Cena'], ['Noche', 'noche', 'Alojamiento (noche)']].forEach(function (c) {
      var x = suma[c[0]] || { a: 0, n: 0 };
      lin(c[2] + ' · adulto', x.a, cfgNum('precio.adulto.' + c[1]));
    });
    [['Desayuno', 'desayuno', 'Desayuno'], ['Comida', 'comida', 'Comida'], ['Cena', 'cena', 'Cena'], ['Noche', 'noche', 'Alojamiento (noche)']].forEach(function (c) {
      var x = suma[c[0]] || { a: 0, n: 0 };
      lin(c[2] + ' · niño', x.n, cfgNum('precio.nino.' + c[1]));
    });
    [['Desayuno', 'Desayuno'], ['Comida', 'Comida'], ['Cena', 'Cena'], ['Noche', 'Alojamiento (noche)']].forEach(function (c) {
      var x = suma[c[0]] || { b: 0 };
      lin(c[1] + ' · 0 a ' + (cfg('edad.gratis_hasta') || 4) + ' años (gratis)', x.b, 0);
    });
    [['Salón', 'salon'], ['Salas', 'salas'], ['Capilla', 'capilla'], ['Garaje', 'garaje']].forEach(function (c) {
      var x = suma[c[0]]; if (x) lin(c[0] + ' (días)', x.dias, cfgNum('precio.' + c[1]));
    });
    var total = lineas.reduce(function (t, l) { return t + (l.imp || 0); }, 0);
    var consultar = lineas.some(function (l) { return l.imp == null; });
    var senal = +(String((r.grupoDatos || {}).senal || '').replace(',', '.')) || 0;
    return { lineas: lineas, total: Math.round(total * 100) / 100, consultar: consultar, senal: senal, pendiente: Math.round((total - senal) * 100) / 100 };
  }

  function htmlHoja(r, modo) {
    var liq = modo === 'liquidacion', m = mapaServ(r), g = r.grupoDatos || {}, c = calcularHoja(r);
    var gratis = +cfg('edad.gratis_hasta') || 4, adulto = +cfg('edad.adulto_desde') || 9;
    var dias = diasDe(r), aloj = tipo(r) === 'Alojamiento';
    var adMax = 0, niMax = 0, beMax = 0; (r.servicios || []).forEach(function (x) { if (SALAS.indexOf(x.servicio) < 0) { adMax = Math.max(adMax, x.adultos); niMax = Math.max(niMax, x.ninos); beMax = Math.max(beMax, x.bebes || 0); } });
    function celda(t, sv) { var x = m[t + '|' + sv]; return x && (x.adultos || x.ninos || x.bebes) ? x.adultos + (x.ninos ? ' <small>+ ' + x.ninos + ' niños</small>' : '') + (x.bebes ? ' <small>+ ' + x.bebes + ' de 0-' + gratis + '</small>' : '') : '—'; }
    var filas = dias.map(function (t) {
      var salas = SALAS.filter(function (sa) { return m[t + '|' + sa]; }).join(', ');
      return '<tr><td class="l"><b>' + esc(diaCorto(t)) + '</b></td>' + COMIDAS.map(function (cm) { return '<td>' + celda(t, cm[0]) + '</td>'; }).join('') +
        (aloj ? '<td>' + celda(t, 'Noche') + '</td>' : '') + '<td class="l">' + (esc(salas) || '—') + '</td></tr>';
    }).join('');
    var pie = esc(cfg('texto.pie_pago')).replace('{dias}', esc(cfg('pago.dias_despues') || '5')).replace('{casa}', esc(cfg('casa.nombre'))).replace('{iban}', '<b>' + esc(cfg('casa.iban')) + '</b>');
    var hoy = legible(hoyTxt());
    return '<div class="hoja-doc">' +
      '<div class="hd-cab"><div><div class="hd-casa">' + esc(cfg('casa.nombre') || 'Casa de Espiritualidad María Madre') + '</div>' +
      '<div class="hd-dir">' + esc(cfg('casa.direccion')) + ' · ' + esc(cfg('casa.cp_ciudad')) + ' · CIF ' + esc(cfg('casa.cif')) + '</div>' +
      '<div class="hd-dir">' + esc(cfg('casa.telefono')) + ' · ' + esc(cfg('casa.email')) + '</div></div>' +
      '<div class="hd-tit"><div>Hoja de estancia</div><span class="hd-sello' + (liq ? ' liq' : '') + '">' + (liq ? 'LIQUIDACIÓN' : 'PRESUPUESTO') + '</span><small>Ref. ' + esc(r.id) + ' · ' + hoy + '</small></div></div>' +
      '<div class="hd-datos">' +
      '<div><small>GRUPO</small><b>' + esc(r.grupo) + '</b></div>' +
      '<div><small>RESPONSABLE</small>' + esc(r.responsable || '—') + (r.telefono ? ' · ' + esc(r.telefono) : '') + (r.email ? ' · ' + esc(r.email) : '') + '</div>' +
      '<div><small>ENTRADA</small>' + esc(diaSemana(r.entrada)) + ', ' + esc(r.horaEntrada) + '</div>' +
      '<div><small>SALIDA</small>' + esc(diaSemana(r.salida)) + ', ' + esc(r.horaSalida) + '</div>' +
      '<div><small>PERSONAS</small>' + adMax + ' adultos' + (niMax ? ' · ' + niMax + ' niños (' + (gratis + 1) + ' a ' + (adulto - 1) + ' años)' : '') + (beMax ? ' · ' + beMax + ' de 0 a ' + gratis + ' años' : '') + '</div>' +
      '<div><small>ENTIDAD Y CIF</small>' + (esc(g.entidad) || '—') + (g.cif ? ' · ' + esc(g.cif) : '') + (g.direccion ? '<br>' + esc(g.direccion) : '') + '</div></div>' +
      (r.servicios && r.servicios.length ? '' : '<p class="hd-aviso">Todavía no hay servicios apuntados para esta reserva.</p>') +
      '<h4>Servicios por día</h4><table class="hd-tabla"><tr><th class="l">Día</th>' + COMIDAS.map(function (cm) { return '<th>' + cm[0] + '</th>'; }).join('') + (aloj ? '<th>Noche</th>' : '') + '<th class="l">Salas</th></tr>' + filas + '</table>' +
      '<h4>Importe</h4><table class="hd-tabla"><tr><th class="l">Concepto</th><th class="r">Unidades</th><th class="r">Precio</th><th class="r">Importe</th></tr>' +
      c.lineas.map(function (l) { return '<tr><td class="l">' + esc(l.txt) + '</td><td class="r">' + l.u + '</td><td class="r">' + euros(l.p) + '</td><td class="r">' + (l.imp == null ? '—' : euros(l.imp)) + '</td></tr>'; }).join('') +
      (c.lineas.length ? '' : '<tr><td class="l" colspan="4">—</td></tr>') + '</table>' +
      '<div class="hd-fin"><div class="hd-cond"><b>Condiciones</b><br>Niños de 0 a ' + gratis + ' años: gratis. De ' + (gratis + 1) + ' a ' + (adulto - 1) + ' años: precio de niño. A partir de ' + adulto + ' años: como adulto.<br>' +
      (cfgNum('precio.solo_uso') != null ? 'Solo uso de la casa (calefacción, luz, agua…): ' + euros(cfgNum('precio.solo_uso')) + ' por persona.<br>' : '') + esc(cfg('texto.condiciones')) + '</div>' +
      '<div class="hd-tot"><div><span>Total' + (c.consultar ? '*' : '') + '</span><b>' + euros(c.total) + '</b></div><div><span>Fianza pagada</span><span>' + euros(c.senal) + '</span></div>' +
      '<div class="hd-pend"><b>Pendiente</b><b>' + euros(c.pendiente) + '</b></div>' + (c.consultar ? '<small>* Sin incluir los conceptos «a consultar».</small>' : '') + '</div></div>' +
      '<div class="hd-pie">' + pie + '<br><span>' + (liq ? 'Cantidades realmente servidas, revisadas por el gestor.' : 'Calculado con los servicios previstos. La liquidación final se hará con lo realmente servido.') + '</span></div>' +
      '</div>';
  }

  function pintarHoja(id, modo) {
    var r = reserva(id);
    var q = ruta().q || {};
    var dest = destinoTrabajo(id, 'estancia');
    if (!r) { vista.innerHTML = botonVolver() + '<div class="vacio">La reserva no existe.</div>'; enlazarVolver(null, dest, true); return; }
    modo = modo === 'liquidacion' ? 'liquidacion' : 'presupuesto';
    var sufOrigen = (q.desde ? '&desde=' + encodeURIComponent(q.desde) : '') + (q.ap ? '&ap=' + encodeURIComponent(q.ap) : '');
    vista.innerHTML = botonVolver() +
      '<div class="hoja-barra"><div class="segmento" id="hModo"><button type="button" data-m="presupuesto"' + (modo === 'presupuesto' ? ' class="activo"' : '') + '>Presupuesto</button><button type="button" data-m="liquidacion"' + (modo === 'liquidacion' ? ' class="activo"' : '') + '>Liquidación</button></div>' +
      '<div class="fila-btns"><button class="btn sec" id="hServ">Corregir servicios</button><button class="btn sec" id="hXls">Descargar Excel</button><button class="btn" id="hPdf">Imprimir / PDF</button></div></div>' +
      '<div class="hoja-marco">' + htmlHoja(r, modo) + '</div>';
    enlazarVolver(null, dest, true);
    $('#hModo').onclick = function (e) { var b = e.target.closest('button'); if (b) reemplazar('hoja/' + encodeURIComponent(r.id) + '?modo=' + b.dataset.m + sufOrigen); };
    $('#hServ').onclick = function () { ir('servicios/' + encodeURIComponent(r.id) + '?desde=hoja&modo=' + modo + (q.ap ? '&ap=' + encodeURIComponent(q.ap) : '')); };
    $('#hXls').onclick = function () {
      cargando(true);
      excelHoja(r, modo).then(function () { toast('Excel descargado'); })
        .catch(function (e) { toast(e.message || 'No se pudo crear el Excel.', true); }).then(function () { cargando(false); });
    };
    $('#hPdf').onclick = function () {
      var t = document.title; document.title = (modo === 'liquidacion' ? 'Liquidación' : 'Presupuesto') + ' · ' + r.grupo;
      document.body.classList.add('imprimiendo-hoja'); window.print();
      setTimeout(function () { document.body.classList.remove('imprimiendo-hoja'); document.title = t; }, 800);
    };
  }

  // ---------------- 1.5.2 · Hoja de estancia en Excel ----------------
  var EXCEL_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
  var excelCarga = null;
  function cargarExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (excelCarga) return excelCarga;
    excelCarga = new Promise(function (ok, mal) {
      var s = document.createElement('script'); s.src = EXCEL_URL; s.integrity = 'sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz'; s.crossOrigin = 'anonymous';
      s.onload = function () { window.ExcelJS ? ok(window.ExcelJS) : mal(new Error('No se pudo preparar el Excel.')); };
      s.onerror = function () { excelCarga = null; mal(new Error('No se pudo descargar el programa de Excel. Comprueba la conexión.')); };
      document.head.appendChild(s);
    });
    return excelCarga;
  }
  function nombreArchivo(t) { return String(t).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80); }

  function excelHoja(r, modo) {
    return cargarExcelJS().then(function (ExcelJS) {
      var liq = modo === 'liquidacion', m = mapaServ(r), g = r.grupoDatos || {}, c = calcularHoja(r);
      var gratis = +cfg('edad.gratis_hasta') || 4, adulto = +cfg('edad.adulto_desde') || 9;
      var dias = diasDe(r), aloj = tipo(r) === 'Alojamiento';
      var GRANATE = 'FF85200C', LINEA = 'FFDDD5CC', SUAVE = 'FFF7F1EA';
      var EUR = '#,##0.00 "€"';
      var wb = new ExcelJS.Workbook(); wb.creator = 'App Casa María Madre'; wb.created = new Date();
      var ws = wb.addWorksheet(liq ? 'Liquidación' : 'Presupuesto', {
        pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
        views: [{ showGridLines: false }]
      });
      // Columnas: Día + (adultos, niños, 0 a 4) por servicio + Salas
      var serv = COMIDAS.map(function (x) { return x[0]; }); if (aloj) serv.push('Noche');
      var K = 3, nCol = 2 + serv.length * K; // A = día, luego grupos de 3, última = salas
      var anchos = [16]; serv.forEach(function () { anchos.push(8, 8, 7); }); anchos.push(22); anchos[nCol - 2] = Math.max(anchos[nCol - 2], 12); anchos[nCol - 3] = Math.max(anchos[nCol - 3], 10);
      ws.columns = anchos.map(function (w) { return { width: w }; });
      function L(n) { var s = ''; n++; while (n > 0) { var k = (n - 1) % 26; s = String.fromCharCode(65 + k) + s; n = Math.floor((n - 1) / 26); } return s; } // 0 → A
      var UL = L(nCol - 1);
      var fila = 1;
      function unir(f, a, b) { ws.mergeCells(L(a) + f + ':' + L(b) + f); }
      function borde(cel, grueso) { cel.border = { bottom: { style: grueso ? 'medium' : 'thin', color: { argb: grueso ? GRANATE : LINEA } } }; }
      // Cabecera
      var cel = ws.getCell('A1'); cel.value = cfg('casa.nombre') || 'Casa de Espiritualidad María Madre';
      cel.font = { name: 'Georgia', size: 15, bold: true, color: { argb: GRANATE } }; unir(1, 0, nCol - 4);
      cel = ws.getCell(L(nCol - 3) + '1'); cel.value = 'HOJA DE ESTANCIA'; cel.font = { name: 'Georgia', size: 13, bold: true }; cel.alignment = { horizontal: 'right' }; unir(1, nCol - 3, nCol - 1);
      cel = ws.getCell('A2'); cel.value = [cfg('casa.direccion'), cfg('casa.cp_ciudad'), cfg('casa.cif') ? 'CIF ' + cfg('casa.cif') : ''].filter(Boolean).join(' · '); cel.font = { size: 9 }; unir(2, 0, nCol - 4);
      cel = ws.getCell(L(nCol - 3) + '2'); cel.value = liq ? 'LIQUIDACIÓN' : 'PRESUPUESTO';
      cel.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cel.alignment = { horizontal: 'center' };
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: liq ? 'FF1F5F3A' : GRANATE } }; unir(2, nCol - 3, nCol - 1);
      cel = ws.getCell('A3'); cel.value = [cfg('casa.telefono'), cfg('casa.email')].filter(Boolean).join(' · '); cel.font = { size: 9 }; unir(3, 0, nCol - 4);
      cel = ws.getCell(L(nCol - 3) + '3'); cel.value = 'Ref. ' + r.id + ' · ' + legible(hoyTxt()); cel.font = { size: 9, color: { argb: 'FF555555' } }; cel.alignment = { horizontal: 'right' }; unir(3, nCol - 3, nCol - 1);
      for (var k = 0; k < nCol; k++) borde(ws.getCell(L(k) + '3'), true);
      fila = 5;
      // Datos del grupo
      var adMax = 0, niMax = 0, beMax = 0; (r.servicios || []).forEach(function (x) { if (SALAS.indexOf(x.servicio) < 0) { adMax = Math.max(adMax, x.adultos); niMax = Math.max(niMax, x.ninos); beMax = Math.max(beMax, x.bebes || 0); } });
      [['Grupo', r.grupo],
       ['Responsable', [r.responsable, r.telefono, r.email].filter(Boolean).join(' · ') || '—'],
       ['Entrada', diaSemana(r.entrada) + ', ' + r.horaEntrada],
       ['Salida', diaSemana(r.salida) + ', ' + r.horaSalida],
       ['Personas', adMax + ' adultos' + (niMax ? ' · ' + niMax + ' niños (' + (gratis + 1) + ' a ' + (adulto - 1) + ' años)' : '') + (beMax ? ' · ' + beMax + ' de 0 a ' + gratis + ' años' : '')],
       ['Entidad y CIF', [g.entidad, g.cif].filter(Boolean).join(' · ') || '—'],
       ['Dirección', g.direccion || '—']
      ].forEach(function (d) {
        var a = ws.getCell('A' + fila); a.value = d[0].toUpperCase(); a.font = { size: 8.5, color: { argb: 'FF666666' } };
        var b = ws.getCell('B' + fila); b.value = d[1]; b.font = d[0] === 'Grupo' ? { bold: true } : {}; unir(fila, 1, nCol - 1);
        fila++;
      });
      fila++;
      function titulo(t) { var x = ws.getCell('A' + fila); x.value = t; x.font = { name: 'Georgia', size: 12, bold: true, color: { argb: GRANATE } }; fila++; }
      // Servicios por día (números editables)
      titulo('Servicios por día');
      var f1 = fila, f2 = fila + 1;
      ws.getCell('A' + f1).value = 'Día'; ws.mergeCells('A' + f1 + ':A' + f2);
      serv.forEach(function (s, i) { var col = 1 + i * K; ws.getCell(L(col) + f1).value = s; unir(f1, col, col + K - 1); ws.getCell(L(col) + f2).value = 'Adultos'; ws.getCell(L(col + 1) + f2).value = 'Niños'; ws.getCell(L(col + 2) + f2).value = '0-' + gratis; });
      ws.getCell(UL + f1).value = 'Salas'; ws.mergeCells(UL + f1 + ':' + UL + f2);
      [f1, f2].forEach(function (f) { for (var k = 0; k < nCol; k++) { var x = ws.getCell(L(k) + f); x.font = { bold: true, size: f === f1 ? 9.5 : 8.5, color: { argb: 'FF444444' } }; x.alignment = { horizontal: k === 0 || k === nCol - 1 ? 'left' : 'center', vertical: 'middle' }; x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUAVE } }; } });
      for (k = 0; k < nCol; k++) borde(ws.getCell(L(k) + f2), true);
      fila = f2 + 1;
      var fIni = fila;
      dias.forEach(function (t, di) {
        ws.getCell('A' + fila).value = diaCorto(t); ws.getCell('A' + fila).font = { bold: true };
        serv.forEach(function (s, i) {
          var x = m[t + '|' + s] || {}, col = 1 + i * K;
          var ca = ws.getCell(L(col) + fila), cn = ws.getCell(L(col + 1) + fila), cb = ws.getCell(L(col + 2) + fila);
          ca.value = x.adultos || null; cn.value = x.ninos || null; cb.value = x.bebes || null;
          ca.alignment = cn.alignment = cb.alignment = { horizontal: 'center' };
        });
        ws.getCell(UL + fila).value = SALAS.filter(function (sa) { return m[t + '|' + sa]; }).join(', ') || null;
        for (var k = 0; k < nCol; k++) borde(ws.getCell(L(k) + fila));
        fila++;
      });
      var fFin = fila - 1;
      fila++;
      // Importe (fórmulas)
      titulo('Importe');
      var cC = 'A', cU = L(nCol - 3), cP = L(nCol - 2), cI = UL;
      ws.getCell(cC + fila).value = 'Concepto'; unir(fila, 0, nCol - 4);
      ws.getCell(cU + fila).value = 'Unidades'; ws.getCell(cP + fila).value = 'Precio'; ws.getCell(cI + fila).value = 'Importe';
      [cC, cU, cP, cI].forEach(function (cl) { var x = ws.getCell(cl + fila); x.font = { bold: true, size: 9.5, color: { argb: 'FF444444' } }; x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUAVE } }; x.alignment = { horizontal: cl === cC ? 'left' : 'right' }; });
      for (k = 0; k < nCol; k++) borde(ws.getCell(L(k) + fila), true);
      fila++;
      var fImpIni = fila, rango = function (col) { return col + fIni + ':' + col + fFin; };
      var porServ = {}; (r.servicios || []).forEach(function (x) { var q = porServ[x.servicio] = porServ[x.servicio] || { a: 0, n: 0, b: 0, d: 0 }; q.a += x.adultos; q.n += x.ninos; q.b += (x.bebes || 0); q.d++; });
      var conceptos = [];
      [['Desayuno', 'desayuno', 'Desayuno'], ['Comida', 'comida', 'Comida'], ['Cena', 'cena', 'Cena'], ['Noche', 'noche', 'Alojamiento (noche)']].forEach(function (cx) {
        var i = serv.indexOf(cx[0]); if (i < 0) return; var q = porServ[cx[0]] || { a: 0, n: 0, b: 0 };
        conceptos.push({ txt: cx[2] + ' · adulto', f: 'SUM(' + rango(L(1 + i * K)) + ')', u: q.a, p: cfgNum('precio.adulto.' + cx[1]) });
        conceptos.push({ txt: cx[2] + ' · niño', f: 'SUM(' + rango(L(2 + i * K)) + ')', u: q.n, p: cfgNum('precio.nino.' + cx[1]) });
      });
      [['Desayuno', 'Desayuno'], ['Comida', 'Comida'], ['Cena', 'Cena'], ['Noche', 'Alojamiento (noche)']].forEach(function (cx) {
        var i = serv.indexOf(cx[0]); if (i < 0) return; var q = porServ[cx[0]] || { b: 0 };
        if (q.b) conceptos.push({ txt: cx[1] + ' · 0 a ' + gratis + ' años (gratis)', f: 'SUM(' + rango(L(3 + i * K)) + ')', u: q.b, p: 0 });
      });
      [['Salón', 'salon'], ['Salas', 'salas'], ['Capilla', 'capilla'], ['Garaje', 'garaje']].forEach(function (cx) {
        var q = porServ[cx[0]] || { d: 0 };
        conceptos.push({ txt: cx[0] + ' (días)', f: 'COUNTIF(' + rango(UL) + ',"*' + cx[0] + '*")', u: q.d, p: cfgNum('precio.' + cx[1]) });
      });
      conceptos.forEach(function (cx) {
        ws.getCell(cC + fila).value = cx.txt; unir(fila, 0, nCol - 4);
        var u = ws.getCell(cU + fila); u.value = { formula: cx.f, result: cx.u }; u.alignment = { horizontal: 'right' };
        var p = ws.getCell(cP + fila); p.value = cx.p; p.numFmt = EUR;
        if (cx.p == null) { p.value = 'a consultar'; p.alignment = { horizontal: 'right' }; p.font = { italic: true, color: { argb: 'FF777777' } }; }
        var im = ws.getCell(cI + fila);
        im.value = { formula: 'IF(ISNUMBER(' + cP + fila + '),' + cU + fila + '*' + cP + fila + ',"—")', result: cx.p == null ? '—' : Math.round(cx.u * cx.p * 100) / 100 }; im.alignment = { horizontal: 'right' };
        im.numFmt = EUR;
        for (var k = 0; k < nCol; k++) borde(ws.getCell(L(k) + fila));
        fila++;
      });
      var fImpFin = fila - 1;
      fila++;
      function tot(txt, val, negrita, color) {
        var a = ws.getCell(cP + fila); a.value = txt; a.alignment = { horizontal: 'right' }; a.font = { bold: !!negrita, color: color ? { argb: color } : undefined };
        var b = ws.getCell(cI + fila); b.value = val; b.numFmt = EUR; b.font = { bold: !!negrita, color: color ? { argb: color } : undefined };
        return fila++;
      }
      var fT = tot('Total' + (c.consultar ? '*' : ''), { formula: 'SUM(' + cI + fImpIni + ':' + cI + fImpFin + ')', result: c.total }, true);
      var fS = tot('Fianza pagada', c.senal);
      var fP = tot('Pendiente', { formula: cI + fT + '-' + cI + fS, result: c.pendiente }, true, GRANATE);
      ws.getCell(cP + fP).border = ws.getCell(cI + fP).border = { top: { style: 'thin', color: { argb: GRANATE } } };
      if (c.consultar) { ws.getCell(cP + fila).value = '* Sin incluir los conceptos «a consultar».'; ws.getCell(cP + fila).font = { size: 8.5, color: { argb: 'FF666666' } }; ws.getCell(cP + fila).alignment = { horizontal: 'right' }; fila++; }
      fila++;
      // Condiciones y pie
      function parrafo(txt, alto, fuente) {
        var x = ws.getCell('A' + fila); x.value = txt; x.alignment = { wrapText: true, vertical: 'top' }; x.font = fuente || { size: 9 };
        unir(fila, 0, nCol - 1); ws.getRow(fila).height = alto; fila++;
      }
      titulo('Condiciones');
      var cond = 'Niños de 0 a ' + gratis + ' años: gratis. De ' + (gratis + 1) + ' a ' + (adulto - 1) + ' años: precio de niño. A partir de ' + adulto + ' años: como adulto.';
      if (cfgNum('precio.solo_uso') != null) cond += '\nSolo uso de la casa (calefacción, luz, agua…): ' + euros(cfgNum('precio.solo_uso')) + ' por persona.';
      if (cfg('texto.condiciones')) cond += '\n' + cfg('texto.condiciones');
      parrafo(cond, 14 * Math.max(2, cond.split('\n').length + Math.floor(cond.length / 110)));
      var pie = cfg('texto.pie_pago').replace('{dias}', cfg('pago.dias_despues') || '5').replace('{casa}', cfg('casa.nombre')).replace('{iban}', cfg('casa.iban'));
      if (pie) parrafo(pie, 14 * Math.max(2, 1 + Math.floor(pie.length / 110)));
      parrafo(liq ? 'Cantidades realmente servidas, revisadas por el gestor.' : 'Calculado con los servicios previstos. La liquidación final se hará con lo realmente servido. Si cambias cantidades en «Servicios por día», el importe se recalcula solo.', 26, { size: 8.5, italic: true, color: { argb: 'FF555555' } });
      ws.pageSetup.printArea = 'A1:' + UL + (fila - 1);
      return wb.xlsx.writeBuffer().then(function (buf) {
        var nombre = nombreArchivo((liq ? 'Liquidación' : 'Presupuesto') + ' - ' + r.grupo + ' - ' + legible(r.entrada).replace(/\//g, '-')) + '.xlsx';
        var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre;
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
        return nombre;
      });
    });
  }

  // ---------------- 1.7.0 · Formulario del grupo (lado del gestor) ----------------
  function marcaCorta(m) { return m ? legible(String(m).slice(0, 10)) + (String(m).length > 10 ? ' ' + String(m).slice(11, 16) : '') : ''; }
  function tarjetaFormulario(r) {
    var f = r.formulario, e = f ? f.estado : '', fuera = hoyTxt() > r.entrada;
    var txt = fuera ? (f && f.datos ? 'Plazo terminado (el día de entrada). Recibido el ' + marcaCorta(f.enviadoEl) + (e === 'Aplicado' ? ', aplicado a la reserva.' : '.') : 'Plazo terminado (el día de entrada): el enlace ya no se puede usar.') :
      !f ? 'Aún no se ha enviado el enlace al grupo.' :
      e === 'Pendiente' ? 'Enlace creado. Esperando a que el grupo lo rellene' + (f.enviadoEl ? ' (último envío: ' + marcaCorta(f.enviadoEl) + ')' : '') + '.' :
      e === 'Recibido' ? '<b>Recibido el ' + marcaCorta(f.enviadoEl) + '.</b> Pendiente de revisar y aplicar.' :
      e === 'Aplicado' ? 'Aplicado a la reserva (recibido el ' + marcaCorta(f.enviadoEl) + ').' :
      e === 'Cerrado' ? 'Cerrado: el grupo ya no puede usarlo.' : esc(e);
    var b = [];
    if (e === 'Recibido') b.push('<button class="btn" id="fRevisar">Revisar y aplicar</button>');
    else if (f && f.datos) b.push('<button class="btn sec" id="fRevisar">Ver lo recibido</button>');
    if (e !== 'Cerrado' && !fuera) b.push('<button class="btn sec" id="fEnviar">' + (f ? 'Enviar el enlace otra vez' : 'Enviar enlace al grupo') + '</button>');
    return '<div class="tarjeta"><h2>Formulario del grupo</h2><p class="sub" style="margin:-4px 0 10px">' + txt + '</p>' +
      '<div class="fila-btns">' + b.join('') + '</div>' +
      (f && !fuera ? '<p class="sub" style="margin:10px 0 0;font-size:13px"><button class="enlace" id="fAbrir">' + (e === 'Cerrado' ? 'Volver a abrir el formulario' : 'Cerrar el formulario') + '</button></p>' : '') + '</div>';
  }
  function enlazarFormulario(r) {
    if ($('#fRevisar')) $('#fRevisar').onclick = function () { ir('formulario/' + encodeURIComponent(r.id) + '?desde=gestionar&ap=formulario'); };
    if ($('#fEnviar')) $('#fEnviar').onclick = function () {
      if (S.sinConexion) return toast('Sin conexión.', true);
      cargando(true);
      usarDB(function () { return DB.prepararFormulario(r.id); })
        .then(function (d) { cargando(false); compartirEnlace(reserva(r.id) || r, d.enlace); })
        .catch(function (e) { cargando(false); toast(e.message, true); });
    };
    if ($('#fAbrir')) $('#fAbrir').onclick = function () {
      var abrir = r.formulario.estado === 'Cerrado';
      confirmar(abrir ? 'El grupo podrá volver a usar su enlace (hasta el día de entrada).' : 'El grupo ya no podrá usar su enlace. Podrás volver a abrirlo cuando quieras.', abrir ? 'Abrir' : 'Cerrar').then(function (ok) {
        if (!ok) return;
        cargando(true);
        usarDB(function () { return DB.abrirFormulario(r.id, abrir); }).then(function () { toast(abrir ? 'Formulario abierto' : 'Formulario cerrado'); pintar(); })
          .catch(function (e) { toast(e.message, true); }).then(function () { cargando(false); });
      });
    };
  }
  function compartirEnlace(r, enlace, cual) {
    var contrato = cual === 'contrato', recordar = cual === 'recordar_senal', presupAct = cual === 'presupuesto_actualizado';
    // Cada forma de envío queda en la bitácora (sin esperar ni mostrar el reloj).
    var apuntado = {};
    function apuntar(t) {
      if (contrato) t = 'contrato_enviado';
      else if (recordar) t = 'senal_recordada';
      else if (presupAct) t = 'presupuesto_actualizado';
      if (apuntado[t] || S.sinConexion) return; apuntado[t] = 1; usarDB(function () { return DB.anotar(r.id, t); }).catch(function () {});
    }
    var fechas = legible(r.entrada) + ' a ' + legible(r.salida);
    var impSenal = euros(cfgNum('contrato.senal') != null ? cfgNum('contrato.senal') : 200);
    var resp = r.responsable ? ', ' + r.responsable : '';
    var texto = contrato
      ? 'Hola. Os enviamos el presupuesto y las condiciones de vuestra estancia en la Casa de Espiritualidad María Madre (' + fechas + '). Podéis revisarlos y aceptarlos desde el móvil en este enlace:'
      : recordar
      ? 'Hola' + resp + '. Le recordamos la fianza de ' + impSenal + ' para su reserva del ' + fechas + ' en la Casa María Madre. Puede adjuntar el comprobante en este enlace:'
      : presupAct
      ? 'Hola. Le enviamos el presupuesto actualizado de su reserva del ' + fechas + ' en la Casa de Espiritualidad María Madre. Puede consultarlo en el mismo enlace:'
      : 'Hola. Para preparar vuestra estancia en la Casa de Espiritualidad María Madre (' + fechas +
      '), por favor rellenad este formulario. Podéis corregirlo con el mismo enlace hasta el día de entrada:';
    var titModal = contrato ? 'Enlace del presupuesto y las condiciones'
      : recordar ? 'Recordar la fianza'
      : presupAct ? 'Enlace del presupuesto actualizado'
      : 'Enlace del formulario';
    var asunto = (contrato ? 'Presupuesto y condiciones'
      : recordar ? 'Recordatorio de la fianza'
      : presupAct ? 'Presupuesto actualizado'
      : 'Formulario') + ' de su estancia · Casa María Madre';
    if (presupAct) apuntar('presupuesto_actualizado');
    modal('<p style="margin-bottom:6px"><b>' + titModal + '</b></p><p class="sub" style="margin:0 0 10px">Envíalo al responsable del grupo. Solo sirve para esta reserva.</p>' +
      '<input class="entrada" id="feEnlace" readonly value="' + esc(enlace) + '" style="font-size:14px">' +
      '<div class="fila-btns" style="margin-top:10px">' + (navigator.share ? '<button class="btn" data-r="share">Compartir…</button>' : '') +
      '<button class="btn sec" data-r="copiar">Copiar</button></div>' +
      '<div class="fila-btns" style="margin-top:8px"><a class="btn sec" data-log="enlace_whatsapp" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(texto + ' ' + enlace) + '">WhatsApp</a>' +
      '<a class="btn sec" data-log="enlace_correo" href="mailto:' + esc(r.email || '') + '?subject=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(texto + '\n\n' + enlace) + '">Correo</a></div>' +
      '<div class="fila-btns" style="margin-top:8px"><button class="btn borde" data-r="0">Cerrar</button></div>',
      function (e, cerrar) {
        var lg = e.target.closest('[data-log]'); if (lg) apuntar(lg.dataset.log);
        var b = e.target.closest('[data-r]'); if (!b) return;
        if (b.dataset.r === '0') { cerrar(); pintar(); return; }
        if (b.dataset.r === 'share') { navigator.share({ title: asunto, text: texto, url: enlace }).then(function () { apuntar('enlace_compartido'); }).catch(function () {}); return; }
        if (b.dataset.r === 'copiar') {
          var i = $('#feEnlace'); i.select(); i.setSelectionRange(0, 9999);
          apuntar('enlace_copiado');
          (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(enlace) : Promise.reject()).then(function () { toast('Enlace copiado'); })
            .catch(function () { try { document.execCommand('copy'); toast('Enlace copiado'); } catch (x) { toast('Mantén pulsado el enlace para copiarlo.', true); } });
        }
      });
  }

  function pintarFormularioRecibido(id) {
    var r = reserva(id);
    var dest = destinoTrabajo(id, 'formulario');
    if (!r || !r.formulario || !r.formulario.datos) { vista.innerHTML = botonVolver() + '<div class="vacio">No hay ningún formulario recibido para esta reserva.</div>'; enlazarVolver(null, dest, true); return; }
    var f = r.formulario, d = f.datos, p = d.personas || {}, g = d.grupo || {}, c = d.contacto || {}, h = d.habitaciones || {}, gd = r.grupoDatos || {};
    var cambios = [];
    function fila(et, nuevo, actual, nombre) {
      var cambia = actual != null && String(nuevo || '') !== String(actual || '') && String(nuevo || '') !== '';
      if (cambia) cambios.push(nombre || et.toLowerCase());
      return '<div class="dato"><span>' + et + '</span><span>' + (esc(nuevo) || '—') + (cambia ? '<br><small class="sub cambio">En la reserva pone ' + (esc(actual) || '—') + ' · se cambiará al aplicar</small>' : '') + '</span></div>';
    }
    var pers = (p.adultos || 0) + (p.ninos || 0) + (p.bebes || 0);
    var porSv = {}; (d.servicios || []).forEach(function (x) { (porSv[x.fecha] = porSv[x.fecha] || []).push(x.servicio + ' ' + x.total); });
    var salas = {}; (d.salas || []).forEach(function (x) { (salas[x.fecha] = salas[x.fecha] || []).push(x.sala); });
    var dias = Object.keys(porSv).concat(Object.keys(salas)).filter(function (x, i, a) { return a.indexOf(x) === i; }).sort();
    var gratis = cfg('edad.gratis_hasta') || 4, adulto = cfg('edad.adulto_desde') || 9;
    vista.innerHTML = botonVolver() +
      '<div class="tarjeta"><h2>' + esc(r.grupo) + '</h2><p class="sub" style="margin:-6px 0 0">Recibido el ' + marcaCorta(f.enviadoEl) + ' · estado: <b>' + esc(f.estado) + '</b></p>%%RESUMEN%%</div>' +
      '<div class="tarjeta"><h2>Personas</h2>' +
      fila('Adultos (desde ' + adulto + ')', p.adultos) + fila('Niños de ' + (+gratis + 1) + ' a ' + (adulto - 1), p.ninos) + fila('Niños de 0 a ' + gratis, p.bebes) +
      fila('Total en la reserva', pers, r.personas, 'personas') + '</div>' +
      '<div class="tarjeta"><h2>Contacto y datos para documentos</h2>' +
      (c.responsable != null ? fila('Responsable', c.responsable, r.responsable, 'responsable') : '') +
      fila('Teléfono', c.telefono, r.telefono, 'teléfono') + fila('Correo', c.email, r.email, 'correo') +
      fila('Entidad', g.entidad, gd.entidad || '') + fila('CIF', g.cif, gd.cif || '', 'CIF') + fila('Dirección', g.direccion, gd.direccion || '') +
      fila('Representante', g.representante, gd.representante || '') + fila('DNI', g.dni, gd.dni || '', 'DNI') + fila('Cargo', g.cargo, gd.cargo || '') + '</div>' +
      '<div class="tarjeta"><h2>Servicios y salas</h2><p class="sub" style="margin:-4px 0 8px;font-size:13px">Total de personas en cada servicio (incluidos los de 0 a ' + gratis + '). Al aplicar se reparte: primero los de 0 a ' + gratis + ', luego los niños y el resto, adultos.</p>' + (dias.length ? dias.map(function (t) {
        return '<div class="dato"><span>' + esc(diaCorto(t)) + '</span><span>' + esc((porSv[t] || []).join(' · ')) + (salas[t] ? '<br><small class="sub">' + esc(salas[t].join(', ')) + '</small>' : '') + '</span></div>';
      }).join('') : '<p class="sub">Sin servicios.</p>') +
      (r.servicios && r.servicios.length ? '<p class="sub" style="margin:8px 0 0;font-size:13px">Al aplicar se sustituyen los servicios que tiene ahora la reserva.</p>' : '') + '</div>' +
      (tipo(r) === 'Alojamiento' ? '<div class="tarjeta"><h2>Habitaciones (preferencias)</h2>' +
        fila('Matrimonios', h.matrimonios) + fila('Comparten', h.comparten) + fila('Individuales', h.individual) + fila('Jóvenes en literas', h.literas) +
        (h.movilidad ? fila('Movilidad reducida (se reparte como «comparten»)', h.movilidad) : '') + (h.observaciones ? fila('Observaciones', h.observaciones) : '') +
        '<p class="sub" style="margin:8px 0 0;font-size:13px">Se guardan para el reparto de habitaciones (no cambian las habitaciones asignadas).</p></div>' : '') +
      '<div class="tarjeta"><h2>Alergias</h2>' + ((d.alergias || []).length ? d.alergias.map(function (a) {
        return '<div class="dato"><span>Persona ' + esc(a.persona) + '</span><span>' + esc(a.alergenos.concat(a.otras ? [a.otras] : []).join(', ')) + '</span></div>';
      }).join('') : '<p class="sub">Ninguna.</p>') + '</div>' +
      '<div class="tarjeta"><h2>Protección de datos</h2>' +
      // 2.1.0: el formulario solo informa; las casillas (imágenes, comunicaciones) se marcan al aceptar las condiciones
      (d.consentimientos && d.consentimientos.informado
        ? '<div class="dato"><span>Información</span><span>Recibida</span></div><p class="sub" style="margin:6px 0 0;font-size:13px">Imágenes y comunicaciones: se eligen al aceptar las condiciones.</p>'
        : '<div class="dato"><span>Tratamiento de datos</span><span>' + (d.consentimientos && d.consentimientos.datos ? 'Sí' : 'No') + '</span></div>' +
          '<div class="dato"><span>Imágenes</span><span>' + (d.consentimientos && d.consentimientos.imagenes ? 'Sí' : 'No') + '</span></div>' +
          '<div class="dato"><span>Actúa en nombre del grupo</span><span>' + (d.consentimientos && d.consentimientos.autorizacion ? 'Sí' : 'No') + '</span></div>') +
      (d.consentimientos && d.consentimientos.textos ? '<details class="txt-acep"><summary>Ver los textos que se le mostraron</summary>' +
        ['basico', 'datos', 'imagenes', 'autorizacion'].map(function (k) { var t = d.consentimientos.textos[k]; return t ? '<p>' + esc(t).replace(/\n/g, '<br>') + '</p>' : ''; }).join('') + '</details>' : '') + '</div>' +
      '<div class="form-espacio"></div><div class="pie-form"><div class="total">' + (f.estado === 'Aplicado' ? 'Ya aplicado' : 'Pendiente de aplicar') + '</div>' +
      '<button class="btn" id="frAplicar">' + (f.estado === 'Aplicado' ? 'Aplicar de nuevo' : 'Aplicar a la reserva') + '</button></div>';
    vista.innerHTML = vista.innerHTML.replace('%%RESUMEN%%', cambios.length ?
      '<p class="cambios-res">Al aplicar cambiarán ' + cambios.length + ' dato' + (cambios.length === 1 ? '' : 's') + ': ' + esc(cambios.join(', ')) + '.</p>' :
      '<p class="sub" style="margin:8px 0 0;font-size:13px">Los datos de contacto y personas coinciden con la reserva.</p>');
    enlazarVolver(null, dest, true);
    $('#frAplicar').onclick = function () {
      if (S.sinConexion) return toast('Sin conexión.', true);
      confirmar('Se pasarán a la reserva el teléfono, el correo, el número de personas, los datos para documentos, los servicios por día, las salas y las alergias. Después podrás corregir lo que quieras.', 'Aplicar').then(function (ok) {
        if (!ok) return;
        cargando(true);
        usarDB(function () { return DB.aplicarFormulario(r.id); }).then(function () { toast('Formulario aplicado a la reserva'); reemplazar(dest); })
          .catch(function (e) { toast(e.message, true); }).then(function () { cargando(false); });
      });
    };
  }

  // ---------------- 1.8.0 · Reparto de habitaciones ----------------
  var USOS = ['Matrimonio', 'Compartida', 'Individual', 'Jóvenes', 'Otro'];
  function esLiteras(h) { return /litera/i.test(h.camas || '') || /cu[aá]druple|qu[ií]ntuple/i.test(h.tipo || ''); }
  /** Lo que pidió el grupo en su formulario (personas por tipo de uso), o null. */
  function pideGrupo(r) {
    var d = r.formulario && r.formulario.datos, h = d && d.habitaciones;
    if (!h || !(h.matrimonios || h.comparten || h.individual || h.literas || h.movilidad)) return null;
    return { Matrimonio: (h.matrimonios || 0) * 2, Compartida: (h.comparten || 0) + (h.movilidad || 0), Individual: h.individual || 0, 'Jóvenes': h.literas || 0 };
  }
  /** Habitaciones ocupadas por otras reservas en las fechas de r: { nº: grupo } */
  function ocupadasPorOtras(r) {
    var oc = {};
    activas().forEach(function (x) {
      if (x.id === r.id) return;
      if (momento(r.entrada, r.horaEntrada) < momento(x.salida, x.horaSalida) && momento(r.salida, r.horaSalida) > momento(x.entrada, x.horaEntrada))
        (x.asignaciones || []).forEach(function (a) { oc[a.habitacion] = x.grupo; });
    });
    return oc;
  }
  /** Fecha del formulario en que se basa el reparto guardado ('' si no se basa en ninguno). */
  function repartoSegun(r) { return (r.asignaciones || []).reduce(function (m, a) { return a.segun && a.segun > m ? a.segun : m; }, ''); }
  function avisoReparto(r) {
    var f = r.formulario, hay = (r.asignaciones || []).length;
    if (!f || !f.datos || !pideGrupo(r) || r.estado === 'Cancelada') return '';
    var seg = repartoSegun(r);
    if (!hay) return '<div class="aviso-suave">El grupo indicó cómo quiere repartirse. Pulse «Reparto de habitaciones» para ver la propuesta.</div>';
    if (seg && f.enviadoEl > seg) return '<div class="aviso-suave">El grupo volvió a enviar su formulario el ' + marcaCorta(f.enviadoEl) + '. Revise el reparto («Volver a proponer»).</div>';
    return '';
  }

  /**
   * Propone un reparto: matrimonios en dobles, compartidas de dos en dos, individuales de una en una y jóvenes en literas.
   * Busca habitaciones seguidas (números consecutivos) para que el grupo quede junto. «fijas» son las cambiadas a mano: no se tocan.
   */
  function proponerReparto(r, pide, fijas) {
    var oc = ocupadasPorOtras(r), usadas = {};
    fijas.forEach(function (a) { usadas[a.habitacion] = true; });
    var libres = habitaciones().filter(function (h) { return h.estado === 'Disponible' && !oc[h.numero] && !usadas[h.numero]; })
      .sort(function (a, b) { return a.numero - b.numero; });
    // Lo que falta por repartir (se descuenta lo que ya está fijado a mano)
    var falta = {};
    Object.keys(pide).forEach(function (u) { falta[u] = pide[u]; });
    fijas.forEach(function (a) { if (falta[a.uso] != null) falta[a.uso] = Math.max(0, falta[a.uso] - a.personas); });
    var out = [];
    // Jóvenes: primero las habitaciones de literas
    var jov = falta['Jóvenes'] || 0;
    libres.filter(esLiteras).sort(function (a, b) { return a.capacidad - b.capacidad || a.numero - b.numero; }).forEach(function (h) {
      if (jov <= 0) return;
      var p = Math.min(h.capacidad, jov); out.push({ habitacion: h.numero, personas: p, uso: 'Jóvenes', manual: false }); jov -= p; usadas[h.numero] = true;
    });
    // Unidades para el resto de habitaciones
    var uds = [];
    for (var i = 0; i < Math.floor((falta.Matrimonio || 0) / 2); i++) uds.push({ p: 2, uso: 'Matrimonio', orden: 0 });
    var comp = falta.Compartida || 0;
    for (i = 0; i < Math.floor(comp / 2); i++) uds.push({ p: 2, uso: 'Compartida', orden: 1 });
    for (i = 0; i < Math.floor(jov / 2); i++) uds.push({ p: 2, uso: 'Jóvenes', orden: 2 });
    for (i = 0; i < (falta.Individual || 0); i++) uds.push({ p: 1, uso: 'Individual', orden: 3 });
    if (comp % 2) uds.push({ p: 1, uso: 'Compartida', orden: 4 });
    if (jov % 2) uds.push({ p: 1, uso: 'Jóvenes', orden: 5 });
    var pool = libres.filter(function (h) { return !usadas[h.numero] && !esLiteras(h); });
    pool = pool.concat(libres.filter(function (h) { return !usadas[h.numero] && esLiteras(h); })); // literas libres, al final
    pool.sort(function (a, b) { return a.numero - b.numero; });
    var k = Math.min(uds.length, pool.length), mejor = null;
    // Ventana de k habitaciones seguidas con menos distancia entre la primera y la última (y en la misma fila si se puede)
    for (var s = 0; s + k <= pool.length && k; s++) {
      var v = pool.slice(s, s + k);
      var filas = {}; v.forEach(function (h) { filas[/superior/i.test(h.ubicacion) ? 'S' : 'I'] = 1; });
      var lit = v.filter(esLiteras).length;
      var nota = (v[k - 1].numero - v[0].numero) * 10 + (Object.keys(filas).length - 1) * 5 + lit * 3 +
        v.reduce(function (t, h) { return t + h.capacidad; }, 0) * 0.1;
      if (!mejor || nota < mejor.nota) mejor = { nota: nota, v: v };
    }
    if (mejor) {
      var hs = mejor.v.slice().sort(function (a, b) { return a.capacidad - b.capacidad || a.numero - b.numero; });
      uds.sort(function (a, b) { return a.orden - b.orden; }).slice(0, k).forEach(function (u, j) {
        out.push({ habitacion: hs[j].numero, personas: u.p, uso: u.uso, manual: false });
      });
    }
    var puestas = out.reduce(function (t, a) { return t + a.personas; }, 0);
    var pedidas = Object.keys(falta).reduce(function (t, u) { return t + falta[u]; }, 0);
    return { lista: out, faltan: Math.max(0, pedidas - puestas) };
  }

  function datosReserva(r) {
    return { id: r.id, tipo: tipo(r), grupo: r.grupo, responsable: r.responsable || '', telefono: r.telefono || '', email: r.email || '',
      entrada: r.entrada, horaEntrada: r.horaEntrada, salida: r.salida, horaSalida: r.horaSalida, estado: r.estado,
      observaciones: r.observaciones || '', personas: r.personas || '' };
  }

  function pintarReparto(id) {
    var r = reserva(id);
    var dest = destinoTrabajo(id, 'habitaciones');
    if (!r || tipo(r) !== 'Alojamiento') { vista.innerHTML = botonVolver() + '<div class="vacio">Esta reserva no tiene alojamiento.</div>'; enlazarVolver(null, dest, true); return; }
    var pide = pideGrupo(r), f = r.formulario;
    var lista = (r.asignaciones || []).map(function (a) { return { habitacion: a.habitacion, personas: a.personas, uso: a.uso || '', manual: !!a.manual, segun: a.segun || '' }; });
    var segun = repartoSegun(r), cambiado = false, aviso = '';
    S.hayCambios = function () { return cambiado; };
    function base() {
      // Sin formulario: todas las personas como «Compartida»
      if (pide) return pide;
      var n = (r.personas || 0) - ((r.servicios || []).reduce(function (m, x) { return Math.max(m, x.bebes || 0); }, 0));
      return { Matrimonio: 0, Compartida: Math.max(0, n), Individual: 0, 'Jóvenes': 0 };
    }
    function proponer() {
      var fijas = lista.filter(function (a) { return a.manual && a.personas > 0; });
      var p = proponerReparto(r, base(), fijas);
      segun = f && f.enviadoEl ? f.enviadoEl : '';
      lista = fijas.concat(p.lista);
      cambiado = true;
      aviso = p.faltan ? '<div class="aviso-suave" style="border-color:#B42318">No hay sitio para todos: faltan <b>' + p.faltan + '</b> personas por colocar en esas fechas. Revise otras reservas o añada habitaciones a mano.</div>' :
        '<div class="aviso-ok">' + (pide ? 'La app ha propuesto este reparto según el formulario del grupo' + (f && f.enviadoEl ? ' (' + marcaCorta(f.enviadoEl) + ')' : '') : 'La app ha propuesto este reparto con las personas de la reserva') +
        '. Puede cambiarlo y pulsar «Guardar reparto».</div>';
    }
    if (!lista.length) proponer();
    else if (f && f.enviadoEl && segun && f.enviadoEl > segun) aviso = '<div class="aviso-suave">El grupo volvió a enviar su formulario el ' + marcaCorta(f.enviadoEl) + '. Pulse «Volver a proponer» para rehacer el reparto (lo cambiado a mano se mantiene).</div>';

    function resumen() {
      var asig = {}, nh = {};
      lista.forEach(function (a) { if (!a.personas) return; var u = a.uso || 'Otro'; asig[u] = (asig[u] || 0) + a.personas; nh[u] = (nh[u] || 0) + 1; });
      var b = base(), filas = '', tp = 0, ta = 0, th = 0;
      var nombres = { Matrimonio: 'Matrimonios', Compartida: 'Comparten habitación', Individual: 'Individuales', 'Jóvenes': 'Jóvenes en literas', Otro: 'Otro / sin uso' };
      USOS.forEach(function (u) {
        var p = b[u] || 0, a = asig[u] || 0, h = nh[u] || 0;
        if (!p && !a) return;
        tp += p; ta += a; th += h;
        filas += '<span>' + nombres[u] + '</span><span class="r">' + (p || '—') + '</span><span class="r ' + (a === p ? 'ok' : 'mal') + '">' + (a === p ? '✓ ' : '') + a + ' en ' + h + ' hab.</span>';
      });
      return '<div class="tarjeta rep-res"><div class="rep-grid"><b>' + (pide ? 'Pide el grupo' : 'Personas') + '</b><b class="r">Pax</b><b class="r">Asignado</b>' + filas +
        '<b>Total</b><b class="r">' + tp + '</b><b class="r">' + ta + ' en ' + th + ' hab.</b></div></div>';
    }
    function filaRep(a, i) {
      var h = hab(a.habitacion) || { tipo: '', capacidad: 0 };
      return '<div class="rep-fila" data-i="' + i + '"><div class="rep-nom"><b>Hab. ' + a.habitacion + '</b> <small>' + esc(h.tipo) + ' · ' + h.capacidad + ' plazas</small>' +
        (a.manual ? ' <span class="tag-man">cambiada a mano</span>' : '') +
        '<select class="entrada rep-uso" aria-label="Uso de la habitación ' + a.habitacion + '">' +
        ['<option value=""' + (!a.uso ? ' selected' : '') + '>Sin indicar</option>'].concat(USOS.map(function (u) { return '<option' + (a.uso === u ? ' selected' : '') + '>' + u + '</option>'; })).join('') +
        '</select></div>' +
        '<div class="paso"><button type="button" data-d="-1" aria-label="Quitar una persona"' + (a.personas <= 0 ? ' disabled' : '') + '>−</button>' +
        '<output>' + a.personas + '/' + h.capacidad + '</output>' +
        '<button type="button" data-d="1" aria-label="Añadir una persona"' + (a.personas >= h.capacidad ? ' disabled' : '') + '>+</button></div></div>';
    }
    function pinta() {
      lista.sort(function (a, b) { return a.habitacion - b.habitacion; });
      var tot = lista.reduce(function (t, a) { return t + a.personas; }, 0);
      vista.innerHTML = botonVolver() +
        '<div class="tarjeta"><h2>' + esc(r.grupo) + '</h2><p class="sub" style="margin:-6px 0 0">' + esc(legible(r.entrada)) + ' → ' + esc(legible(r.salida)) + ' · ' + noches(r) + ' noches</p></div>' +
        aviso + resumen() +
        '<div class="tarjeta"><h2>Habitaciones</h2>' + (lista.length ? lista.map(filaRep).join('') : '<p class="sub">Sin habitaciones.</p>') +
        '<div class="fila-btns" style="margin-top:10px"><button type="button" class="btn sec" id="rAnadir">+ Añadir habitación</button><button type="button" class="btn sec" id="rProponer">Volver a proponer</button></div>' +
        '<p class="sub" style="margin:10px 0 0;font-size:13px">Lo que cambie a mano queda marcado y no se toca al volver a proponer. Las habitaciones con 0 personas se quitan al guardar.</p></div>' +
        '<div class="form-espacio"></div><div class="pie-form"><div class="total"><b>' + tot + '</b> pernoctan · ' + lista.filter(function (a) { return a.personas; }).length + ' hab.</div>' +
        '<button class="btn" id="rGuardar">Guardar reparto</button></div>';
      enlazarVolver(null, dest, true);
      $$('.rep-fila').forEach(function (el) {
        var a = lista[+el.dataset.i];
        el.querySelector('select').onchange = function () {
          // 2.0.2 · Un matrimonio son 2 pax en su habitación
          if (this.value === 'Matrimonio') {
            var hm = hab(a.habitacion);
            if (hm && hm.capacidad < 2) { this.value = a.uso; return toast('La habitación ' + a.habitacion + ' es de 1 plaza: no cabe un matrimonio.', true); }
            a.personas = 2;
          }
          a.uso = this.value; a.manual = true; cambiado = true; pinta();
        };
        el.querySelector('.paso').onclick = function (e) {
          var b = e.target.closest('button[data-d]'); if (!b) return;
          var h = hab(a.habitacion); a.personas = Math.max(0, Math.min(h.capacidad, a.personas + Number(b.dataset.d))); a.manual = true; cambiado = true; pinta();
        };
      });
      $('#rProponer').onclick = function () {
        var hay = lista.some(function (a) { return a.manual; });
        confirmar('Se rehará el reparto' + (pide ? ' según el formulario del grupo' : '') + '.' + (hay ? ' Las habitaciones cambiadas a mano se mantienen.' : ''), 'Volver a proponer')
          .then(function (ok) { if (ok) { proponer(); pinta(); } });
      };
      $('#rAnadir').onclick = function () {
        var oc = ocupadasPorOtras(r), ya = {}; lista.forEach(function (a) { ya[a.habitacion] = 1; });
        var libres = habitaciones().slice().sort(function (a, b) { return a.numero - b.numero; })
          .filter(function (h) { return h.estado === 'Disponible' && !oc[h.numero] && !ya[h.numero]; });
        if (!libres.length) return toast('No quedan habitaciones libres en esas fechas.', true);
        modal('<p><b>Añadir habitación</b><br><span class="sub">Libres en esas fechas</span></p><div class="rep-libres">' +
          libres.map(function (h) { return '<button type="button" class="chip" data-n="' + h.numero + '"><b>' + h.numero + '</b> <small>' + esc(h.tipo) + '</small></button>'; }).join('') +
          '</div><div class="fila-btns" style="margin-top:10px"><button class="btn borde" data-r="0">Volver</button></div>', function (e, cerrar) {
          var b = e.target.closest('[data-n]');
          if (b) { lista.push({ habitacion: +b.dataset.n, personas: 1, uso: 'Otro', manual: true, segun: '' }); cambiado = true; cerrar(); pinta(); return; }
          if (e.target.closest('[data-r]')) cerrar();
        });
      };
      $('#rGuardar').onclick = function () {
        if (S.sinConexion) return toast('Sin conexión.', true);
        var asign = lista.filter(function (a) { return a.personas > 0; }).map(function (a) { return { habitacion: a.habitacion, personas: a.personas, uso: a.uso, manual: a.manual, segun: segun }; });
        cargando(true);
        usarDB(function () { return DB.guardarReserva(datosReserva(r), asign, 'reparto'); })
          .then(function () { S.hayCambios = null; toast('Reparto guardado'); reemplazar(dest); })
          .catch(function (e) { toast(e.message, true); }).then(function () { cargando(false); });
      };
    }
    pinta();
  }

  // ---------------- 1.8.0 · Hoja de habitaciones (uso interno) ----------------
  function consumosHab(p, n) {
    var cam = Math.max(1, cfgNum('consumo.cambio_cama') || 7), toa = Math.max(1, cfgNum('consumo.cambio_toallas') || 3);
    var juegosCama = n > 0 ? 1 + Math.floor((n - 1) / cam) : 1, juegosToalla = n > 0 ? 1 + Math.floor((n - 1) / toa) : 1;
    return {
      cama: p * (cfgNum('consumo.persona.cama') || 0) * juegosCama,
      tg: p * (cfgNum('consumo.persona.toalla_grande') || 0) * juegosToalla,
      tp: p * (cfgNum('consumo.persona.toalla_pequena') || 0) * juegosToalla,
      rollos: cfgNum('consumo.hab.rollos') || 0,
      gel: cfgNum('consumo.hab.gel') || 0
    };
  }
  function htmlHojaHab(r) {
    var n = noches(r), lista = (r.asignaciones || []).slice().sort(function (a, b) { return a.habitacion - b.habitacion; });
    var T = { p: 0, cama: 0, tg: 0, tp: 0, rollos: 0, gel: 0 };
    var filas = lista.map(function (a) {
      var h = hab(a.habitacion) || {}, c = consumosHab(a.personas, n);
      T.p += a.personas; T.cama += c.cama; T.tg += c.tg; T.tp += c.tp; T.rollos += c.rollos; T.gel += c.gel;
      return '<tr><td class="l"><b>' + a.habitacion + '</b></td><td class="l">' + esc(h.tipo || '') + '</td><td class="l">' + esc(a.uso || '—') + '</td><td>' + a.personas + '</td>' +
        '<td>' + c.cama + '</td><td>' + c.tg + '</td><td>' + c.tp + '</td><td>' + c.rollos + '</td><td>' + c.gel + '</td></tr>';
    }).join('');
    var bebes = (r.servicios || []).reduce(function (m, x) { return Math.max(m, x.bebes || 0); }, 0);
    var cam = cfgNum('consumo.cambio_cama') || 7, toa = cfgNum('consumo.cambio_toallas') || 3;
    return '<div class="hoja-doc">' +
      '<div class="hd-cab"><div><div class="hd-casa">' + esc(cfg('casa.nombre') || 'Casa de Espiritualidad María Madre') + '</div>' +
      '<div class="hd-dir">Uso interno · no se entrega al grupo</div></div>' +
      '<div class="hd-tit"><div>Hoja de habitaciones</div><small>Ref. ' + esc(r.id) + ' · ' + legible(hoyTxt()) + '</small></div></div>' +
      '<div class="hd-datos">' +
      '<div><small>GRUPO</small><b>' + esc(r.grupo) + '</b></div>' +
      '<div><small>RESPONSABLE</small>' + esc(r.responsable || '—') + (r.telefono ? ' · ' + esc(r.telefono) : '') + '</div>' +
      '<div><small>ENTRADA</small>' + esc(diaSemana(r.entrada)) + ', ' + esc(r.horaEntrada) + '</div>' +
      '<div><small>SALIDA</small>' + esc(diaSemana(r.salida)) + ', ' + esc(r.horaSalida) + '</div>' +
      '<div><small>PERNOCTAN</small>' + T.p + ' personas en ' + lista.length + ' habitaciones · ' + n + ' noches</div>' +
      '<div><small>NIÑOS DE 0 A ' + (cfg('edad.gratis_hasta') || 4) + '</small>' + (bebes ? bebes + ' (no ocupan cama; consultar si necesitan algo)' : 'ninguno') + '</div></div>' +
      '<h4>Plano</h4>' + plano(r.asignaciones) +
      '<h4>Preparación por habitación</h4><table class="hd-tabla"><tr><th class="l">Hab.</th><th class="l">Tipo</th><th class="l">Uso</th><th>Pax</th><th>Juegos cama</th><th>Toallas grandes</th><th>Toallas pequeñas</th><th>Papel</th><th>Gel</th></tr>' +
      (filas || '<tr><td class="l" colspan="9">Sin habitaciones asignadas.</td></tr>') +
      '<tr class="hd-total"><td class="l" colspan="3"><b>Total</b></td><td><b>' + T.p + '</b></td><td><b>' + T.cama + '</b></td><td><b>' + T.tg + '</b></td><td><b>' + T.tp + '</b></td><td><b>' + T.rollos + '</b></td><td><b>' + T.gel + '</b></td></tr></table>' +
      '<div class="hd-pie">Ropa de cama: un juego por persona' + (n > cam ? ', con cambio cada ' + cam + ' noches (incluido en la cuenta)' : '') +
      '. Toallas: ' + (n > toa ? 'cambio cada ' + toa + ' noches (incluido en la cuenta)' : 'un juego por persona') + '. Reglas en Administración › Consumos.</div>' +
      '</div>';
  }
  function pintarHojaHab(id) {
    var r = reserva(id);
    var q = ruta().q || {};
    var dest = destinoTrabajo(id, 'habitaciones');
    if (!r) { vista.innerHTML = botonVolver() + '<div class="vacio">La reserva no existe.</div>'; enlazarVolver(null, dest, true); return; }
    vista.innerHTML = botonVolver() +
      '<div class="hoja-barra"><div class="fila-btns"><button class="btn sec" id="hhRep">Cambiar reparto</button><button class="btn" id="hhPdf">Imprimir / PDF</button></div></div>' +
      '<div class="hoja-marco">' + htmlHojaHab(r) + '</div>';
    enlazarVolver(null, dest, true);
    $('#hhRep').onclick = function () { ir('reparto/' + encodeURIComponent(r.id) + '?desde=habitaciones' + (q.ap ? '&ap=' + encodeURIComponent(q.ap) : '')); };
    $('#hhPdf').onclick = function () {
      var t = document.title; document.title = 'Habitaciones · ' + r.grupo;
      document.body.classList.add('imprimiendo-hoja'); window.print();
      setTimeout(function () { document.body.classList.remove('imprimiendo-hoja'); document.title = t; }, 800);
    };
  }

  // ---------------- 2.2.1 · Ficha imprimible de la reserva (uso interno) ----------------
  function textoFaltaPaso(r, p) {
    var fi = r.firma, f = r.formulario;
    if (p.t === 'Reserva') return 'Confirmar la reserva';
    if (p.t === 'Condiciones') return p.e === 'ahora' ? 'Esperar la aceptación del presupuesto y las condiciones' : 'Enviar el presupuesto y las condiciones';
    if (p.t === 'Fianza') {
      if (fi && fi.comprobante) return 'Comprobar la fianza (comprobante recibido' + (fi.comprobanteEl ? ' el ' + legible(String(fi.comprobanteEl).slice(0, 10)) : '') + ')';
      if (p.txt.indexOf('más de 7 días') >= 0) return 'Recordar la fianza al grupo (más de 7 días desde la firma)';
      return 'Cobrar o comprobar la fianza';
    }
    if (p.t === 'Formulario') {
      if (f && f.estado === 'Recibido') return 'Aplicar el formulario recibido' + (f.enviadoEl ? ' el ' + legible(String(f.enviadoEl).slice(0, 10)) : '');
      if (p.e === 'ahora') return 'Recibir y aplicar el formulario del grupo';
      return 'Enviar el formulario al grupo';
    }
    if (p.t === 'Habitaciones') return p.e === 'aviso' ? 'Revisar el reparto de habitaciones' : 'Hacer el reparto de habitaciones';
    if (p.t === 'Presupuesto actualizado') return 'Enviar el presupuesto actualizado';
    if (p.t === 'Estancia') return 'Realizar la estancia (' + legible(r.entrada) + ' a ' + legible(r.salida) + ')';
    if (p.t === 'Liquidación') return p.e === 'ahora' ? 'Hacer y enviar la liquidación' : 'Liquidación (después de la estancia)';
    return p.sig || (p.t + ': ' + p.txt);
  }

  function htmlHojaFicha(r) {
    var bloq = tipo(r) === 'Bloqueo', canc = r.estado === 'Cancelada', aloj = tipo(r) === 'Alojamiento';
    var tipoLeg = bloq ? 'Bloqueo / descanso' : aloj ? 'Alojamiento' : 'Jornada (día / sala)';
    var pasos = (bloq || canc) ? [] : pasosReserva(r);
    var g = r.grupoDatos || {}, fi = r.firma, f = r.formulario, fDat = f && f.datos;
    var hoy = legible(hoyTxt());

    // 1. Cabecera
    var estCls = canc ? 'canc' : (r.estado === 'Provisional' && !bloq) ? 'prov' : 'conf';
    var estTxt = canc ? 'Cancelada' : bloq ? 'Bloqueo' : (r.estado || 'Confirmada');
    var cabHtml =
      '<div class="hd-cab hf-cab"><div>' +
        '<div class="hd-casa">' + esc(cfg('casa.nombre') || 'Casa de Espiritualidad María Madre') + '</div>' +
        '<div class="hf-grupo">' + esc(r.grupo) + '</div>' +
        '<div class="hf-fechas">' + esc(diaSemana(r.entrada)) + ' ' + esc(r.horaEntrada) + ' → ' + esc(diaSemana(r.salida)) + ' ' + esc(r.horaSalida) +
        (aloj ? ' · ' + noches(r) + ' noche' + (noches(r) === 1 ? '' : 's') : '') + ' · <b>' + esc(tipoLeg) + '</b></div>' +
      '</div>' +
      '<div class="hd-tit">' +
        '<span class="hf-est ' + estCls + '">' + esc(estTxt) + '</span>' +
        '<small>ID: <b>' + esc(r.id) + '</b></small>' +
        '<small>Impreso el ' + esc(hoy) + '</small>' +
      '</div></div>';

    // 2. Recuadro «Falta para concluir (n)» o «Reserva completa» (no sale en bloqueos ni canceladas)
    var faltaBox = '';
    if (!bloq && !canc) {
      var pend = pasos.filter(function (p) { return p.e !== 'ok'; });
      var incompletos = [];
      if (!String(r.responsable || '').trim()) incompletos.push('responsable');
      if (!String(r.telefono || '').trim()) incompletos.push('teléfono');
      if (!String(r.email || '').trim()) incompletos.push('correo');
      if (!pend.length && !incompletos.length) {
        faltaBox = '<div class="hf-box ok"><b>✓ Reserva completa</b></div>';
      } else {
        faltaBox = '<div class="hf-box falta"><div class="hf-box-tit">Falta para concluir (' + pend.length + ')</div>' +
          (pend.length ? '<ul class="hf-chk">' + pend.map(function (p) { return '<li>☐ ' + esc(textoFaltaPaso(r, p)) + '</li>'; }).join('') + '</ul>' : '') +
          (incompletos.length ? '<div class="hf-inc"><b>Datos incompletos:</b> falta ' + esc(incompletos.join(', ')) + '.</div>' : '') +
          '</div>';
      }
    }

    // 3. Dos columnas: Datos de la reserva | Presupuesto y fianza
    function valOblig(v) { var t = String(v == null ? '' : v).trim(); return t ? esc(t) : '<b class="hf-rojo">Falta</b>'; }
    function valOpc(v) { var t = String(v == null ? '' : v).trim(); return t ? esc(t) : '—'; }
    var adMax = 0, niMax = 0, beMax = 0;
    (r.servicios || []).forEach(function (x) {
      if (SALAS.indexOf(x.servicio) < 0) {
        adMax = Math.max(adMax, x.adultos || 0);
        niMax = Math.max(niMax, x.ninos || 0);
        beMax = Math.max(beMax, x.bebes || 0);
      }
    });
    if (!adMax && !niMax && !beMax && fDat && fDat.personas) {
      adMax = fDat.personas.adultos || 0;
      niMax = fDat.personas.ninos || 0;
      beMax = fDat.personas.bebes || 0;
    }
    var persTxt = (r.personas || 0) + ' personas';
    if (adMax || niMax || beMax) {
      var des = [adMax + ' adultos'];
      if (niMax) des.push(niMax + ' niños');
      if (beMax) des.push(beMax + ' de 0 a ' + (cfg('edad.gratis_hasta') || 4) + ' años');
      persTxt = (r.personas || (adMax + niMax + beMax)) + ' (' + des.join(' · ') + ')';
    }
    var colDatos = '<div class="hf-col"><h4>Datos de la reserva</h4>' +
      (bloq ? '<div class="hf-kv"><span>Tipo</span><span>Bloqueo / descanso</span></div>' :
        '<div class="hf-kv"><span>Responsable</span><span>' + valOblig(r.responsable) + '</span></div>' +
        '<div class="hf-kv"><span>Teléfono</span><span>' + valOblig(r.telefono) + '</span></div>' +
        '<div class="hf-kv"><span>Correo</span><span>' + valOblig(r.email) + '</span></div>' +
        '<div class="hf-kv"><span>Entidad</span><span>' + valOpc(g.entidad || (fDat && fDat.grupo && fDat.grupo.entidad)) + '</span></div>' +
        '<div class="hf-kv"><span>CIF</span><span>' + valOpc(g.cif || (fDat && fDat.grupo && fDat.grupo.cif)) + '</span></div>' +
        '<div class="hf-kv"><span>Personas</span><span>' + esc(persTxt) + '</span></div>') +
      (r.observaciones ? '<div class="hf-kv"><span>Observaciones</span><span>' + esc(r.observaciones) + '</span></div>' : '') +
      '</div>';

    // Columna 2: Presupuesto y señal
    var papel = marcaDoc(r, 'Contrato firmado en papel', 'Contrato: marcado sin firmar');
    var condTxt = (fi && fi.estado === 'Firmado')
      ? 'Firmadas el ' + legible(String(fi.firmadoEl || '').slice(0, 10)) + (fi.nombre ? ' por ' + fi.nombre : '')
      : papel.enviado ? 'Firmadas en papel' + (papel.b ? ' (' + legible(String(papel.b.fecha || '').slice(0, 10)) + ')' : '')
      : (fi && fi.estado === 'Pendiente') ? 'Enviadas (sin firmar)' : 'Sin firmar';
    var hojaCalc = calcularHoja(r);
    var impIni = (fi && fi.importe !== '' && fi.importe != null && !isNaN(+fi.importe)) ? +fi.importe : (hojaCalc.total || null);
    var preIniTxt = impIni ? euros(impIni) : '—';
    var fz = senalPagada(r);
    var impSenalCfg = cfgNum('contrato.senal') != null ? cfgNum('contrato.senal') : 200;
    var impSenalNum = hojaCalc.senal > 0 ? hojaCalc.senal : impSenalCfg;
    var fechaSenal = fz.b ? legible(String(fz.b.fecha || '').slice(0, 10)) : '';
    var senalTxt = euros(impSenalNum) + ' · ' + (fz.pagada ? 'Pagada' + (fechaSenal ? ' el ' + fechaSenal : '') : 'Pendiente');
    var compTxt = (fi && fi.comprobante)
      ? 'Recibido' + (fi.comprobanteEl ? ' el ' + legible(String(fi.comprobanteEl).slice(0, 10)) : '')
      : 'No';
    var pa = marcaDoc(r, 'Presupuesto actualizado enviado', 'Presupuesto actualizado: marcado');
    var paFecha = pa.enviado && pa.b ? legible(String(pa.b.fecha || '').slice(0, 10))
      : (fi && fi.actualizadoEl ? legible(String(fi.actualizadoEl).slice(0, 10)) : '');
    var impAct = (fi && fi.importeActualizado !== '' && fi.importeActualizado != null && !isNaN(+fi.importeActualizado)) ? +fi.importeActualizado : null;
    var preActTxt = (pa.enviado || paFecha)
      ? 'Enviado' + (paFecha ? ' el ' + paFecha : '') + (impAct != null ? ' (' + euros(impAct) + ')' : (hojaCalc.total ? ' (' + euros(hojaCalc.total) + ')' : ''))
      : 'Sin enviar';
    var totalVigente = impAct != null ? impAct : (hojaCalc.total ? hojaCalc.total : (impIni || 0));
    var restoNum = Math.max(0, Math.round((totalVigente - impSenalNum) * 100) / 100);
    var restoTxt = totalVigente > 0 ? euros(restoNum) : '—';
    var colPresup = '<div class="hf-col"><h4>Presupuesto y fianza</h4>' +
      '<div class="hf-kv"><span>Condiciones</span><span>' + esc(condTxt) + '</span></div>' +
      '<div class="hf-kv"><span>Presupuesto inicial</span><span>' + esc(preIniTxt) + '</span></div>' +
      '<div class="hf-kv"><span>Fianza</span><span>' + esc(senalTxt) + '</span></div>' +
      '<div class="hf-kv"><span>Comprobante</span><span>' + esc(compTxt) + '</span></div>' +
      '<div class="hf-kv"><span>Presupuesto actualizado</span><span>' + esc(preActTxt) + '</span></div>' +
      '<div class="hf-kv"><span>Resto estimado</span><span><b>' + esc(restoTxt) + '</b></span></div>' +
      '</div>';

    // 4. Servicios previstos por día (desayuno, comida y cena con su número) y salas
    var m = mapaServ(r), dias = diasDe(r), hayServ = (r.servicios || []).length > 0;
    var filasServ = dias.map(function (t) {
      function numSv(sv) { var x = m[t + '|' + sv]; var tot = x ? (x.adultos || 0) + (x.ninos || 0) + (x.bebes || 0) : 0; return tot ? String(tot) : '—'; }
      var salas = SALAS.filter(function (sa) { return m[t + '|' + sa]; }).join(', ');
      return '<tr><td class="l"><b>' + esc(diaCorto(t)) + '</b></td>' +
        '<td>' + numSv('Desayuno') + '</td><td>' + numSv('Comida') + '</td><td>' + numSv('Cena') + '</td>' +
        (aloj ? '<td>' + numSv('Noche') + '</td>' : '') +
        '<td class="l">' + (esc(salas) || '—') + '</td></tr>';
    }).join('');
    var secServ = bloq ? '' : '<h4>Servicios previstos por día y salas</h4>' +
      (hayServ ? '<table class="hd-tabla hf-tabla"><tr><th class="l">Día</th><th>Desayuno</th><th>Comida</th><th>Cena</th>' + (aloj ? '<th>Noche</th>' : '') + '<th class="l">Salas</th></tr>' + filasServ + '</table>'
        : '<p class="hf-sub">Sin servicios apuntados todavía.</p>');

    // 5. Alergias anónimas (A, B, C… con alérgenos y «Otras»)
    var aler = (r.alergias && r.alergias.length) ? r.alergias : ((fDat && fDat.alergias) || []);
    var secAler = bloq ? '' : '<h4>Alergias e intolerancias (anónimas)</h4>' +
      (aler.length ? '<div class="hf-aler">' + aler.map(function (a) {
        var lista = (a.alergenos || []).concat(a.otras ? [a.otras] : []).join(', ');
        return '<span class="hf-chip"><b>Persona ' + esc(a.persona) + ':</b> ' + esc(lista) + '</span>';
      }).join(' ') + '</div>' : '<p class="hf-sub">Ninguna.</p>');

    // 6. Habitaciones
    var secHab = '';
    if (aloj && !bloq) {
      var asig = (r.asignaciones || []).slice().sort(function (a, b) { return a.habitacion - b.habitacion; });
      if (asig.length) {
        secHab = '<h4>Habitaciones (' + asig.length + ' hab. · ' + pernoctan(r) + ' personas)</h4>' +
          '<div class="hf-habs">' + asig.map(function (a) {
            return '<span class="hf-chip"><b>Hab. ' + a.habitacion + ':</b> ' + a.personas + ' pers.' + (a.uso ? ' (' + esc(a.uso) + ')' : '') + '</span>';
          }).join(' ') + '</div>';
      } else {
        var fh = fDat && fDat.habitaciones;
        var pedido = [];
        if (fh) {
          if (fh.matrimonios) pedido.push(fh.matrimonios + ' matrimonio' + (fh.matrimonios === 1 ? '' : 's'));
          if (fh.comparten) pedido.push(fh.comparten + ' comparten');
          if (fh.individual) pedido.push(fh.individual + ' individual' + (fh.individual === 1 ? '' : 'es'));
          if (fh.literas) pedido.push(fh.literas + ' en literas');
          if (fh.movilidad) pedido.push(fh.movilidad + ' movilidad reducida');
          if (fh.observaciones) pedido.push('«' + fh.observaciones + '»');
        }
        secHab = '<h4>Habitaciones</h4><p class="hf-sub"><b>Sin reparto.</b>' +
          (pedido.length ? ' Pedido por el grupo en el formulario: ' + esc(pedido.join(' · ')) + '.' : ' El grupo aún no ha indicado preferencias en el formulario.') + '</p>';
      }
    }

    // 7. Evolución: los 8 pasos con ✓, ! u ○, su texto y su fecha y quién
    var secEvo = '';
    if (pasos.length) {
      secEvo = '<h4>Evolución</h4><div class="hf-evo">' + pasos.map(function (p) {
        var ic = p.e === 'ok' ? '✓' : p.e === 'aviso' ? '!' : '○';
        return '<div class="hf-paso e-' + p.e + '"><span class="hf-ic">' + ic + '</span>' +
          '<b>' + esc(p.t) + ':</b> <span>' + esc(p.txt) + '</span>' +
          (p.cq ? ' <small>(' + esc(p.cq) + ')</small>' : '') + '</div>';
      }).join('') + '</div>';
    }

    // 8. Últimas 5 notas de la bitácora
    var bit5 = (r.bitacora || []).slice(0, 5);
    var secBit = '<h4>Últimas anotaciones de la bitácora</h4>' +
      (bit5.length ? '<ul class="hf-bit">' + bit5.map(function (b) {
        return '<li><span class="hf-bf">' + esc(marcaLegible(b.fecha)) + '</span> · <b>' + esc(b.gestor) + '</b> · ' + esc(textoBitacora(b)) + '</li>';
      }).join('') + '</ul>' : '<p class="hf-sub">Sin anotaciones.</p>');

    // 9. Pie
    var pieDoc = '<div class="hd-pie hf-pie">Documento interno de la Casa. Sin nombres de ocupantes.</div>';

    return '<div class="hoja-doc hf-doc">' + cabHtml + faltaBox +
      '<div class="hf-dos">' + colDatos + colPresup + '</div>' +
      secServ + secAler + secHab + secEvo + secBit + pieDoc + '</div>';
  }

  function pintarHojaFicha(id) {
    var r = reserva(id);
    var dest = destinoTrabajo(id, '');
    if (!r) { vista.innerHTML = botonVolver() + '<div class="vacio">La reserva no existe.</div>'; enlazarVolver(null, dest, true); return; }
    vista.innerHTML = botonVolver() +
      '<div class="hoja-barra"><div class="fila-btns"><button class="btn" id="hfPdf">Imprimir / PDF</button></div></div>' +
      '<div class="hoja-marco">' + htmlHojaFicha(r) + '</div>';
    enlazarVolver(null, dest, true);
    $('#hfPdf').onclick = function () {
      var t = document.title; document.title = 'Ficha · ' + r.grupo;
      document.body.classList.add('imprimiendo-hoja'); window.print();
      setTimeout(function () { document.body.classList.remove('imprimiendo-hoja'); document.title = t; }, 800);
    };
  }

  // ---------------- Administración (solo administradores) ----------------
  function pintarAdmin() {
    if (!S.datos.esAdmin) { vista.innerHTML = botonVolver() + '<div class="vacio">Solo los administradores pueden ver esta pantalla.</div>'; enlazarVolver(); return; }
    var cfg = S.datos.config || [], grupos = [], por = {}, orig = {};
    var abiertos = lsGet('adAbiertos') || {};
    cfg.forEach(function (a) { orig[a.clave] = a.valor; if (!por[a.grupo]) { por[a.grupo] = []; grupos.push(a.grupo); } por[a.grupo].push(a); });
    function campo(a) {
      var id = 'ad_' + a.clave.replace(/\W/g, '_');
      var etiqueta = esc(String(a.descripcion || '').replace(/Señal de reserva/g, 'Fianza').replace(/Señal/g, 'Fianza').replace(/señal/g, 'fianza')) + (a.tipo === 'euros' ? ' (€)' : '');
      if (a.tipo === 'largo') return '<label class="campo"><span>' + etiqueta + '</span><textarea class="entrada" id="' + id + '" data-k="' + esc(a.clave) + '" maxlength="' + (a.clave === 'texto.contrato' ? 30000 : 4000) + '"' + (String(a.valor || '').length > 400 ? ' rows="' + (a.clave === 'texto.contrato' ? 20 : 10) + '"' : '') + '>' + esc(a.valor) + '</textarea></label>';
      var extra = a.tipo === 'euros' ? ' inputmode="decimal" placeholder="a consultar"' : a.tipo === 'num' ? ' inputmode="numeric"' : ' maxlength="120"';
      return '<label class="campo"><span>' + etiqueta + '</span><input class="entrada" id="' + id + '" data-k="' + esc(a.clave) + '" value="' + esc(a.valor) + '"' + extra + ' autocomplete="off"></label>';
    }
    vista.innerHTML = botonVolver() +
      '<div class="aviso-suave">Solo para administradores. Los cambios valen para los documentos que se hagan a partir de ahora; los ya enviados no cambian. Un precio vacío sale como «a consultar».</div>' +
      grupos.map(function (g) {
        return '<details class="tarjeta ad-grupo" data-g="' + esc(g) + '"' + (abiertos[g] ? ' open' : '') + '><summary><span class="ad-tit">' + esc(g) + '</span>' +
          '<span class="ad-n">' + por[g].length + '</span><span class="ad-punto" title="Cambios sin guardar"></span></summary>' + por[g].map(campo).join('') + '</details>';
      }).join('') +
      '<div class="form-espacio"></div><div class="pie-form"><div class="total" id="adEstado">Sin cambios</div><button class="btn" id="adGuardar">Guardar cambios</button></div>';
    function cambios() {
      var v = {};
      $$('[data-k]').forEach(function (el) { var k = el.dataset.k; if (String(el.value).trim() !== String(orig[k] == null ? '' : orig[k]).trim()) v[k] = el.value; });
      return v;
    }
    S.hayCambios = function () { return Object.keys(cambios()).length > 0; };
    vista.oninput = function () {
      var est = $('#adEstado'); if (!est) return;
      var v = cambios(), n = Object.keys(v).length;
      est.textContent = n ? n + (n === 1 ? ' cambio sin guardar' : ' cambios sin guardar') : 'Sin cambios';
      $$('.ad-grupo').forEach(function (d) { d.classList.toggle('con-cambios', $$('[data-k]', d).some(function (el) { return v.hasOwnProperty(el.dataset.k); })); });
    };
    $$('.ad-grupo').forEach(function (d) { d.addEventListener('toggle', function () { var a = lsGet('adAbiertos') || {}; a[d.dataset.g] = d.open; lsSet('adAbiertos', a); }); });
    enlazarVolver(null, 'ajustes', true);
    $('#adGuardar').onclick = function () {
      var v = cambios(), n = Object.keys(v).length;
      if (!n) return toast('No hay cambios que guardar.');
      if (S.sinConexion) return toast('Sin conexión.', true);
      cargando(true);
      usarDB(function () { return DB.guardarAjustes(v); }).then(function (d) { S.hayCambios = null; toast('Guardado · ' + d.cambios + (d.cambios === 1 ? ' cambio' : ' cambios')); pintarAdmin(); })
        .catch(function (e) { toast(e.message, true); }).then(function () { cargando(false); });
    };
  }

  function pintarAjustes() {
    var c = lsGet('cache'), aj = S.datos.ajustes || {};
    vista.innerHTML =
      '<div class="tarjeta"><h2>Sesión</h2><div class="dato"><span>Has entrado como</span><span><b>' + esc(S.gestor || '') + '</b></span></div>' +
      '<p class="sub" style="margin:10px 0 0">Queda anotado en cada reserva que crees o modifiques. Para entrar como otra persona, cierra la sesión y entra con su clave.</p></div>' +
      '<div class="tarjeta"><h2>Casa</h2>' +
      '<div class="dato"><span>Habitaciones disponibles</span><span>' + habitaciones().filter(function (h) { return h.estado === 'Disponible'; }).length + ' de ' + habitaciones().length + '</span></div>' +
      '<div class="dato"><span>Plazas disponibles</span><span>' + capacidadDisponible() + '</span></div>' +
      '<div class="dato"><span>Horario por defecto</span><span>Entrada ' + esc(aj.horaEntrada || '12:00') + ' · Salida ' + esc(aj.horaSalida || '16:00') + '</span></div></div>' +
      (S.datos.esAdmin ? '<div class="tarjeta"><h2>Administración</h2><p class="sub" style="margin:0 0 10px">Precios, edades, datos de la casa, contrato, consumos y textos de los documentos.</p><button class="btn ancho" id="aAdmin">Abrir Administración</button></div>' : '') +
      '<details class="tarjeta mant"><summary>Mantenimiento (solo administración)</summary>' +
      '<p class="sub">Aviso de prueba: comprueba que llegan los avisos de reservas provisionales a ' + esc(aj.avisoPara || 'la cuenta de la casa') + '.</p>' +
      '<button class="btn borde ancho" id="aProbar">Enviar un aviso de prueba</button>' +
      '<p class="sub" style="margin-top:14px">Regenerar: vuelve a crear en Google Calendar todas las citas a partir de las reservas (si alguien ha tocado el calendario a mano).</p>' +
      '<button class="btn borde ancho" id="aRegenerar">Regenerar calendario de Google</button>' +
      (DEMO ? '<button class="btn borde ancho" id="aReiniciar" style="margin-top:10px">Reiniciar demostración</button>' : '') +
      '</details>' +
      '<div class="tarjeta"><h2>Versión</h2>' +
      '<div class="dato"><span>App</span><span><b>' + VERSION + '</b> · ' + VERSION_FECHA + '</span></div>' +
      '<div class="dato"><span>Servidor (puente)</span><span><b>' + esc(aj.version || '—') + '</b></span></div>' +
      '<div class="dato"><span>Datos comprobados</span><span>' + (S.ultimaCarga ? new Date(S.ultimaCarga).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—') + '</span></div>' +
      '<p class="sub" style="margin:8px 0 0;font-size:11.5px">Pantalla ' + screen.width + '×' + screen.height + ' · ventana ' + window.innerWidth + '×' + window.innerHeight + ' · app ' + Math.round($('#app').getBoundingClientRect().height) + (window.navigator.standalone ? ' · instalada' : '') + '</p></div>' +
      '<button class="btn peligro ancho" id="aSalir">Cerrar sesión en este móvil</button>';
    function accion(nombre, texto, fmt) {
      return function () {
        if (S.sinConexion) return toast('Sin conexión.', true);
        confirmar(texto, 'Continuar').then(function (ok) {
          if (!ok) return;
          cargando(true);
          usarDB(function () { return DB[nombre](); }).then(function (d) { toast(fmt(d)); pintarAjustes(); })
            .catch(function (e) { toast(e.message, true); }).then(function () { cargando(false); });
        });
      };
    }
    $('#aProbar').onclick = accion('probarAviso', 'Se enviará un correo de prueba a la cuenta de la casa con el formato del aviso.',
      function (d) { return 'Aviso de prueba enviado a ' + d.para + (d.avisosProgramados ? '' : ' · ATENCIÓN: los avisos de los lunes aún no están programados'); });
    $('#aRegenerar').onclick = accion('regenerarCalendario', 'Se borrarán los eventos creados por la app y se volverán a crear desde las reservas.',
      function (d) { return d.eventos + ' eventos regenerados'; });
    if ($('#aReiniciar')) $('#aReiniciar').onclick = function () {
      confirmar('Se borrarán los datos de demostración de este dispositivo.', 'Reiniciar', true).then(function (ok) {
        if (!ok) return; window.__GAS_RESET__ && window.__GAS_RESET__(); lsDel('demoIniciada2'); lsDel('cache'); location.reload();
      });
    };
    if ($('#aAdmin')) $('#aAdmin').onclick = function () { ir('admin'); };
    $('#aSalir').onclick = function () { confirmar('Tendrás que volver a escribir la clave para entrar.', 'Cerrar sesión', true).then(function (ok) { if (ok) salir(); }); };
  }

  // ---------------- Arranque ----------------
  $('#tituloCasa').textContent = C.NOMBRE_CASA || 'Casa';
  $('#menu').onclick = function (e) {
    var b = e.target.closest('button[data-ir]'); if (!b) return;
    salirSiSinCambios(function () {
      if (b.dataset.ir === 'calendario') S.mes = null;
      ir(b.dataset.ir);
    });
  };
  $('#btnRecargar').onclick = function () { recargar(); };
  window.addEventListener('hashchange', pintar);
  // Al volver a la app (si han pasado más de 2 minutos): comprobar con el reloj y luego mostrar.
  // Si se está escribiendo en un formulario, no se toca nada.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !S.clave || !S.datos || editando()) return;
    if (Date.now() - (S.ultimaCarga || 0) < 120000) return;
    recargar(true); // comprobación de fondo: sin reloj
  });
  avisoConexion();

  S.clave = lsGet('clave'); S.gestor = lsGet('gestor');
  // Al abrir: primero se comprueban los datos (con el reloj) y luego se muestra la pantalla, una sola vez.
  // Si no hay conexión, se muestran los últimos datos guardados con el aviso de «sin conexión».
  if (S.clave) recargar(false, true);
  else pintarLogin();

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
