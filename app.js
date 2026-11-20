/* Casa María Madre – app de gestión de ocupación (v1.1) */
(function () {
  'use strict';
  var C = window.CONFIG || {};
  var DEMO = !C.API_URL;
  var VERSION = '1.6.0';
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
  function cargando(on) { $('#cargando').hidden = !on; }
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

  function fijarDatos(d) { S.datos = d; S.sinConexion = false; lsSet('cache', { datos: d, cuando: Date.now() }); avisoConexion(); }

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

  function editando() { var v = ruta().vista; return v === 'nueva' || v === 'editar'; }

  /** Recarga datos. Si se está editando una reserva NO se redibuja (para no perder lo escrito). */
  function recargar(silencioso) {
    if (!silencioso) cargando(true);
    return cargarTodo().then(function () { if (!editando()) pintar(); })
      .catch(function (e) {
        if (e.codigo === 'CLAVE') return salir('La clave ya no es válida. Vuelve a entrar.');
        var c = lsGet('cache');
        if (e.red && c) { S.datos = c.datos; S.sinConexion = true; avisoConexion(); if (!editando()) pintar(); }
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
  var TITULOS = { calendario: 'Calendario', reservas: 'Reservas', nueva: 'Nueva reserva', editar: 'Editar reserva', reserva: 'Reserva', ajustes: 'Ajustes', admin: 'Administración', servicios: 'Servicios y datos', hoja: 'Hoja de estancia' };
  function ruta() {
    var h = location.hash.replace(/^#\/?/, '');
    var q = {}, partes = h.split('?');
    (partes[1] || '').split('&').forEach(function (kv) { if (kv) { var p = kv.split('='); q[p[0]] = decodeURIComponent(p[1] || ''); } });
    var seg = partes[0].split('/');
    return { vista: seg[0] || 'calendario', id: seg[1] ? decodeURIComponent(seg[1]) : null, q: q, hash: location.hash };
  }
  function ir(h) { if (location.hash === '#/' + h) pintar(); else location.hash = '/' + h; }
  var historial = 0;
  window.addEventListener('hashchange', function () { historial++; });
  function volver() { if (historial > 0 && history.length > 1) history.back(); else ir('calendario'); }
  function botonVolver() { return '<button class="volver" id="bVolver"><span>‹</span> Volver</button>'; }
  function enlazarVolver(antes) { var b = $('#bVolver'); if (b) b.onclick = function () { if (antes) antes(); volver(); }; }

  function pintar() {
    if (!S.clave) return pintarLogin();
    if (!S.datos) return;
    var r = ruta();
    $('#menu').hidden = false; $('#btnRecargar').hidden = false;
    $('#tituloVista').textContent = TITULOS[r.vista] || '';
    document.body.setAttribute('data-vista', r.vista);
    $$('.menu button').forEach(function (b) {
      b.classList.toggle('activo', b.dataset.ir === r.vista || (b.dataset.ir === 'reservas' && (r.vista === 'reserva' || r.vista === 'servicios' || r.vista === 'hoja')) || (b.dataset.ir === 'ajustes' && r.vista === 'admin'));
    });
    vista.scrollTop = 0; window.scrollTo(0, 0);
    switch (r.vista) {
      case 'reservas': return pintarReservas();
      case 'reserva': return pintarDetalle(r.id);
      case 'nueva': return pintarFormulario(null, r.q);
      case 'editar': return pintarFormulario(r.id, r.q);
      case 'ajustes': return pintarAjustes();
      case 'admin': return pintarAdmin();
      case 'servicios': return pintarServicios(r.id);
      case 'hoja': return pintarHoja(r.id, r.q.modo);
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
      '<button class="btn ancho" id="lEntrar" style="margin-top:14px">Entrar</button></div></div>';
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
    var esHoy = m.getFullYear() === hoy.getFullYear() && m.getMonth() === hoy.getMonth();
    vista.innerHTML =
      '<div class="cal-solo">' +
      '<div class="mes-cab"><button class="icono" id="cAnt" aria-label="Mes anterior">‹</button>' +
      '<h2>' + esc(nombreMes(m)) + (esHoy ? '' : ' <button class="hoy-btn" id="cHoy">Hoy</button>') + '</h2>' +
      '<button class="icono" id="cSig" aria-label="Mes siguiente">›</button></div>' +
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
    if ($('#rWord')) $('#rWord').onclick = exportarWord;
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
  function datosRelacion() {
    var rango = S.relModo === 'rango';
    var desde = rango && S.relDesde ? S.relDesde : '', hasta = rango && S.relHasta ? S.relHasta : '9999-12-31';
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
      '<button data-m="todas" class="' + (!rango ? 'activo' : '') + '">Todas las reservas</button>' +
      '<button data-m="rango" class="' + (rango ? 'activo' : '') + '">Entre fechas</button></div>' +
      (rango ? '<div class="dos" style="margin-top:10px"><label class="campo"><span>Desde</span><input class="entrada" id="rDesde" type="date" value="' + esc(S.relDesde) + '"></label>' +
        '<label class="campo"><span>Hasta</span><input class="entrada" id="rHasta" type="date" value="' + esc(S.relHasta) + '"></label></div>' : '') +
      '<div class="fila-btns" style="margin-top:6px"><button class="btn sec" id="rPdf">PDF / Imprimir</button><button class="btn sec" id="rWord">Word</button></div></div>' +
      '<div class="tarjeta" id="relacion"><div class="rel-cab">Lista de reservas · ' + esc(C.NOMBRE_CASA || '') + '<small>' + esc(textoRango()) + '</small></div>' +
      (cuerpo || '<div class="vacio">No hay reservas.</div>') + '</div>';
  }
  function textoRango() {
    if (S.relModo !== 'rango' || (!S.relDesde && !S.relHasta)) return 'Todas las reservas';
    return (S.relDesde ? 'Desde ' + legible(S.relDesde) : 'Hasta') + (S.relDesde && S.relHasta ? ' hasta ' : ' ') + (S.relHasta ? legible(S.relHasta) : '');
  }
  function exportarWord() {
    var grupos = datosRelacion();
    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">' +
      '<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#222}h1{font-family:Georgia,serif;color:#85200C;font-size:16pt;margin:0 0 4pt}' +
      'h2{font-size:12pt;color:#89588B;margin:18pt 0 6pt;border-bottom:1px solid #DAD6E4}p{margin:0 0 14pt;line-height:1.35}.d{color:#666;font-size:9.5pt}' +
      '.o{color:#666;font-size:9.5pt;font-style:italic}.c{text-decoration:line-through;color:#999}.e{font-size:8.5pt;font-weight:bold}</style></head><body>' +
      '<h1>Lista de reservas · ' + esc(C.NOMBRE_CASA || '') + '</h1><p class="d">' + esc(textoRango()) + ' · generada el ' + legible(hoyTxt()) + '</p>' +
      grupos.map(function (g) {
        return '<h2>' + g.mes + ' ' + g.anio + '</h2>' + g.items.map(function (r) {
          var l = lineaRelacion(r);
          var est = r.estado === 'Cancelada' ? ' <span class="e" style="color:#B42318">CANCELADA</span>' : (r.estado === 'Provisional' && tipo(r) !== 'Bloqueo') ? ' <span class="e" style="color:#B7791F">PROVISIONAL</span>' : '';
          return '<p><span' + (l.cancelada ? ' class="c"' : '') + '>&#9632; <b>' + l.dias + ':</b> ' + (l.negrita ? '<b>' + l.titulo + '</b>' : l.titulo) +
            (tipo(r) === 'Día / sala' ? ' (sin alojamiento)' : '') + '</span>' + est +
            (l.detalle ? '<br><span class="d">' + l.detalle.replace(/<[^>]+>/g, '') + '</span>' : '') + (l.obs ? '<br><span class="o">' + l.obs + '</span>' : '') + '</p>';
        }).join('');
      }).join('') + '</body></html>';
    var blob = new Blob(['﻿', html], { type: 'application/msword' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'Lista_reservas_' + hoyTxt() + '.doc';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Documento de Word descargado');
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
  function pintarDetalle(id) {
    var r = reserva(id);
    if (!r) { vista.innerHTML = botonVolver() + '<div class="vacio">La reserva no existe.</div>'; enlazarVolver(); return; }
    $('#tituloVista').textContent = r.grupo;
    var cap = capacidadDisponible();
    var tel = String(r.telefono || '').replace(/[^\d+]/g, '');
    var bloq = tipo(r) === 'Bloqueo';
    vista.innerHTML = botonVolver() +
      '<div class="tarjeta det ' + clases(r) + '">' + etiquetas(r) +
      '<h2 style="margin-top:8px">' + esc(r.grupo) + '</h2>' +
      '<div class="dato"><span>Tipo</span><span>' + esc(tipo(r)) + '</span></div>' +
      '<div class="dato"><span>' + (bloq ? 'Desde' : 'Entrada') + '</span><span>' + esc(diaSemana(r.entrada)) + ' · ' + esc(r.horaEntrada) + '</span></div>' +
      '<div class="dato"><span>' + (bloq ? 'Hasta' : 'Salida') + '</span><span>' + esc(diaSemana(r.salida)) + ' · ' + esc(r.horaSalida) + '</span></div>' +
      (tipo(r) === 'Alojamiento' ? '<div class="dato"><span>Noches</span><span>' + noches(r) + '</span></div>' : '') +
      (!bloq ? '<div class="dato"><span>Responsable</span><span>' + esc(r.responsable || '—') + '</span></div>' +
        '<div class="dato' + (!r.telefono ? ' falta-tel' : '') + '"><span>Teléfono</span><span>' + (tel ? '<a href="tel:' + esc(tel) + '">' + esc(r.telefono) + '</a>' : 'Sin teléfono') + '</span></div>' +
        '<div class="dato' + (!r.email ? ' falta-email' : '') + '"><span>Email</span><span>' + (r.email ? '<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>' : 'Sin email') + '</span></div>' : '') +
      (r.observaciones ? '<div class="dato"><span>Observaciones</span><span>' + esc(r.observaciones) + '</span></div>' : '') +
      (r.estado === 'Provisional' && !bloq ? '<div class="dato"><span>Aviso a 1 mes</span><span>' + (r.avisoEnviado ? 'Enviado el ' + esc(r.avisoEnviado) : 'Pendiente') + '</span></div>' : '') +
      '</div>' +
      (tipo(r) === 'Alojamiento' ? '<div class="kpis"><div class="kpi"><b>' + (r.personas || 0) + '</b><span>personas</span></div>' +
        '<div class="kpi"><b>' + pernoctan(r) + '</b><span>pernoctan</span></div>' +
        '<div class="kpi"><b>' + (cap ? Math.round(pernoctan(r) * 100 / cap) : 0) + '%</b><span>de ' + cap + ' plazas</span></div></div>' +
        '<div class="tarjeta"><h2>Habitaciones</h2>' + plano(r.asignaciones) + '</div>' : '') +
      (!bloq && r.estado !== 'Cancelada' ? '<div class="tarjeta"><h2>Hoja de estancia</h2><p class="sub" style="margin:-4px 0 10px">' + resumenServicios(r) + '</p>' +
        '<div class="fila-btns"><button class="btn sec" id="dServ">Servicios y datos</button><button class="btn sec" id="dHoja">Ver hoja de estancia</button></div></div>' : '') +
      '<div class="fila-btns">' +
      (r.estado !== 'Cancelada' ? (tel ? '<a class="btn sec" href="tel:' + esc(tel) + '">Llamar</a>' : '') + '<button class="btn" id="dEditar">Editar</button>' : '') +
      '</div>' +
      '<div class="fila-btns" style="margin-top:10px">' +
      (r.estado !== 'Cancelada' ? '<button class="btn peligro" id="dCancelar">Cancelar reserva</button>' : '') +
      '<button class="btn peligro borde-p" id="dBorrar">Borrar</button></div>' +
      '<p class="sub" style="margin-top:16px;font-size:12px">Creada por ' + esc(r.creadoPor || '—') + entreParen(marcaLegible(r.creadoEl)) +
      (r.modificadoPor && (marcaLegible(r.modificadoEl) !== marcaLegible(r.creadoEl) || r.modificadoPor !== r.creadoPor)
        ? ' · Modificada por ' + esc(r.modificadoPor) + entreParen(marcaLegible(r.modificadoEl)) : '') + '</p>';
    enlazarVolver();
    if ($('#dEditar')) $('#dEditar').onclick = function () { ir('editar/' + encodeURIComponent(r.id)); };
    if ($('#dServ')) $('#dServ').onclick = function () { ir('servicios/' + encodeURIComponent(r.id)); };
    if ($('#dHoja')) $('#dHoja').onclick = function () { ir('hoja/' + encodeURIComponent(r.id) + '?modo=presupuesto'); };
    function accion(nombre, texto, boton, ok) {
      return function () {
        if (S.sinConexion) return toast('Sin conexión: no se puede hacer ahora.', true);
        confirmar(texto, boton, true).then(function (si) {
          if (!si) return;
          cargando(true);
          usarDB(function () { return DB[nombre](r.id); }).then(function () { toast(ok); ir('calendario'); })
            .catch(function (e) { toast(e.message, true); }).then(function () { cargando(false); });
        });
      };
    }
    if ($('#dCancelar')) $('#dCancelar').onclick = accion('cancelarReserva', '¿Cancelar la reserva de <b>' + esc(r.grupo) + '</b>? Se quitará del calendario y quedará marcada como cancelada en la lista de reservas.', 'Sí, cancelar', 'Reserva cancelada');
    $('#dBorrar').onclick = accion('borrarReserva', '¿<b>Borrar</b> definitivamente «' + esc(r.grupo) + '»? Desaparecerá de la app, de la lista de reservas y del calendario. <b>No se puede deshacer.</b>' +
      (r.estado !== 'Cancelada' ? '<br><br>Si solo se ha anulado, mejor usa «Cancelar reserva» para que quede constancia.' : ''), 'Sí, borrar', 'Reserva borrada');
  }

  // ---------------- Formulario ----------------
  function pintarFormulario(id, q) {
    q = q || {};
    var aj = (S.datos && S.datos.ajustes) || {};
    var r = id ? reserva(id) : null;
    if (id && !r) { vista.innerHTML = botonVolver() + '<div class="vacio">La reserva no existe.</div>'; enlazarVolver(); return; }
    var claveBorrador = 'borrador:' + (id || 'nueva');
    var borrador = lsGet(claveBorrador);
    var f = r ? JSON.parse(JSON.stringify(r)) : {
      tipo: 'Alojamiento', grupo: '', responsable: '', telefono: '', email: '', entrada: q.fecha || '', horaEntrada: aj.horaEntrada || '12:00',
      salida: q.salida || (q.fecha ? sumaDias(q.fecha, 2) : ''), horaSalida: aj.horaSalida || '16:00', estado: 'Provisional', observaciones: '', personas: '', asignaciones: []
    };
    var recuperado = false;
    if (borrador && borrador.f && (!q.fecha || borrador.f.entrada === q.fecha)) { f = borrador.f; recuperado = true; }
    f.tipo = f.tipo || 'Alojamiento';
    var asig = {}; (f.asignaciones || []).forEach(function (a) { asig[a.habitacion] = a.personas; });
    var habs = habitaciones().slice().sort(function (a, b) { return a.numero - b.numero; });
    var estado = f.estado === 'Confirmada' ? 'Confirmada' : 'Provisional';
    var tipoSel = TIPOS.indexOf(f.tipo) >= 0 ? f.tipo : 'Alojamiento';

    vista.innerHTML = '<div id="fForm">' + botonVolver() +
      (recuperado ? '<div class="aviso-suave">Se ha recuperado lo que estabas escribiendo. <button class="enlace" id="fDescartar">Descartar</button></div>' : '') +
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
      '<label class="campo" id="fPersBloque" style="margin-top:12px"><span>Personas (total del grupo)</span><input class="entrada" id="fPers" type="number" inputmode="numeric" min="0" value="' + esc(f.personas || '') + '" placeholder="Si se deja vacío, se cuentan las de las habitaciones"></label>' +
      '<label class="campo" style="margin-top:12px"><span>Observaciones</span><textarea class="entrada" id="fObs" maxlength="500" placeholder="Notas, peticiones… (más adelante: alergias y dietas)">' + esc(f.observaciones) + '</textarea></label>' +
      '</div>' +
      '<div class="tarjeta" id="fHabsBloque"><h2>Habitaciones</h2><p class="sub" style="margin-top:-6px">Personas que pernoctan en cada habitación.</p>' +
      '<div class="fila-btns" style="margin-bottom:6px"><button type="button" class="btn sec" id="fAuto">Repartir automáticamente</button><button type="button" class="btn borde" id="fVaciar">Vaciar</button></div>' +
      '<h3>Fila superior</h3><div class="lista-hab" id="fHabsSup"></div><h3>Fila inferior</h3><div class="lista-hab" id="fHabsInf"></div></div>' +
      '<div class="form-espacio"></div>' +
      '<div class="pie-form"><div class="total" id="fTotal"></div><button class="btn" id="fGuardar">Guardar</button></div></div>';

    function leer() {
      return {
        id: r ? r.id : undefined, tipo: tipoSel, grupo: $('#fGrupo').value.trim(), responsable: $('#fResp').value.trim(),
        telefono: formatoTel($('#fTel').value), email: $('#fEmail').value.trim(), entrada: $('#fEnt').value,
        horaEntrada: $('#fHEnt').value || '12:00', salida: $('#fSal').value, horaSalida: $('#fHSal').value || '16:00',
        estado: tipoSel === 'Bloqueo' ? 'Confirmada' : estado, observaciones: $('#fObs').value.trim(), personas: $('#fPers').value
      };
    }
    function guardarBorrador() {
      var d = leer(); d.asignaciones = Object.keys(asig).filter(function (k) { return asig[k] > 0; }).map(function (k) { return { habitacion: +k, personas: asig[k] }; });
      lsSet(claveBorrador, { f: d, cuando: Date.now() });
    }
    $('#fForm').addEventListener('input', guardarBorrador);
    $('#fForm').addEventListener('change', guardarBorrador);
    if ($('#fDescartar')) $('#fDescartar').onclick = function () { lsDel(claveBorrador); pintarFormulario(id, q); };
    enlazarVolver(function () { lsDel(claveBorrador); });

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
      $('#fHabsSup').innerHTML = habs.filter(function (h) { return /superior/i.test(h.ubicacion); }).map(function (h) { return filaHab(h, oc); }).join('');
      $('#fHabsInf').innerHTML = habs.filter(function (h) { return !/superior/i.test(h.ubicacion); }).map(function (h) { return filaHab(h, oc); }).join('');
      pintaTotal();
    }
    function total() { return Object.keys(asig).reduce(function (s, k) { return s + (asig[k] || 0); }, 0); }
    function pintaTotal() {
      var t = total(), manual = +$('#fPers').value || 0;
      if (tipoSel === 'Bloqueo') { $('#fTotal').innerHTML = '<b>Bloqueo</b> de la casa'; return; }
      if (tipoSel === 'Día / sala') { $('#fTotal').innerHTML = '<b>' + (manual || '—') + '</b> personas · sin alojamiento'; return; }
      $('#fTotal').innerHTML = '<b>' + Math.max(t, manual) + '</b> personas · ' + t + ' pernoctan / ' + capacidadDisponible() + ' plazas';
    }
    function alPulsar(e) {
      var b = e.target.closest('button[data-d]'); if (!b) return;
      var n = Number(b.closest('.item').dataset.n), h = hab(n);
      asig[n] = Math.max(0, Math.min(h.capacidad, (asig[n] || 0) + Number(b.dataset.d)));
      var el = vista.querySelector('.item[data-n="' + n + '"]'); if (el) el.outerHTML = filaHab(h, ocupadas());
      pintaTotal(); guardarBorrador();
    }
    $('#fHabsSup').onclick = alPulsar; $('#fHabsInf').onclick = alPulsar;
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
      $('#fHabsBloque').hidden = tipoSel !== 'Alojamiento';
      $('#fPersBloque').hidden = bloq;
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

    pintaTipo(); pintaEstado(); pintaHabs(); revisarContacto();
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
      if (tipoSel === 'Alojamiento' && !asignaciones.length) faltan.push('personas en habitaciones');
      var seguir = faltan.length ? confirmar('Falta: <b>' + faltan.join(', ') + '</b>. ¿Guardar igualmente?', 'Guardar') : Promise.resolve(true);
      seguir.then(function (ok) {
        if (!ok) return;
        cargando(true);
        usarDB(function () { return DB.guardarReserva(d, asignaciones); })
          .then(function (res) {
            lsDel(claveBorrador);
            toast((r ? 'Cambios guardados' : 'Reserva creada') + (res.solapes && res.solapes.length ? ' · coincide con: ' + res.solapes.join(', ') : ''));
            location.replace('#/reserva/' + encodeURIComponent(res.id));
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
    sv.forEach(function (x) { if (c[x.servicio] != null) c[x.servicio] += (x.adultos || 0) + (x.ninos || 0); });
    return c.Noche + ' pernoctaciones · ' + c.Desayuno + ' desayunos · ' + c.Comida + ' comidas · ' + c.Cena + ' cenas';
  }

  function pintarServicios(id) {
    var r = reserva(id);
    if (!r) { vista.innerHTML = botonVolver() + '<div class="vacio">La reserva no existe.</div>'; enlazarVolver(); return; }
    var dias = diasDe(r), m = mapaServ(r), g = r.grupoDatos || {};
    var aloj = tipo(r) === 'Alojamiento';
    var maxA = 0, maxN = 0, maxB = 0;
    (r.servicios || []).forEach(function (x) { maxA = Math.max(maxA, x.adultos); maxN = Math.max(maxN, x.ninos); maxB = Math.max(maxB, x.bebes); });
    if (!(r.servicios || []).length) maxA = r.personas || 0;
    function num(idc, v, lbl) { return '<label class="sv-num"><span>' + lbl + '</span><input class="entrada" type="number" inputmode="numeric" min="0" max="999" id="' + idc + '" value="' + (v ? v : '') + '" placeholder="0"></label>'; }
    function filaComida(t, nombre) {
      var x = m[t + '|' + nombre] || {};
      return '<div class="sv-fila"><b>' + nombre + '</b>' + num('a_' + t + '_' + nombre, x.adultos, 'Adultos') + num('n_' + t + '_' + nombre, x.ninos, 'Niños') + '</div>';
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
      campo('gSen', 'Señal pagada (€)', g.senal, ' inputmode="decimal" maxlength="12" placeholder="0"') + '</div>' +
      '<div class="pie-form"><div class="total" id="svTotal"></div><button class="btn" id="svGuardar">Guardar</button></div>';
    enlazarVolver();
    function v(idc) { var e = document.getElementById(idc); return e ? Math.max(0, Math.floor(+e.value || 0)) : 0; }
    function leer() {
      var out = [], bebes = v('pB');
      dias.forEach(function (t) {
        COMIDAS.concat([['Noche']]).forEach(function (c) {
          var a = v('a_' + t + '_' + c[0]), n = v('n_' + t + '_' + c[0]);
          if (a || n) out.push({ fecha: t, servicio: c[0], adultos: a, ninos: n, bebes: bebes });
        });
        SALAS.forEach(function (sa) { var e = document.getElementById('s_' + t + '_' + sa); if (e && e.checked) out.push({ fecha: t, servicio: sa, adultos: 1, ninos: 0, bebes: 0 }); });
      });
      return out;
    }
    function total() {
      var c = calcularHoja({ servicios: leer(), grupoDatos: {} });
      $('#svTotal').innerHTML = 'Previsto: <b>' + euros(c.total) + '</b>' + (c.consultar ? ' <small>+ a consultar</small>' : '');
    }
    total();
    vista.oninput = function () { if ($('#svTotal')) total(); };
    $$('.sv-salas input').forEach(function (e) { e.onchange = function () { e.parentNode.classList.toggle('activo', e.checked); total(); }; });
    $('#svAuto').onclick = function () {
      var a = v('pA'), n = v('pN');
      dias.forEach(function (t, i) {
        COMIDAS.forEach(function (c) {
          var dentro = (t > r.entrada || c[1] >= r.horaEntrada) && (t < r.salida || c[1] < r.horaSalida);
          var ea = document.getElementById('a_' + t + '_' + c[0]), en = document.getElementById('n_' + t + '_' + c[0]);
          ea.value = dentro && a ? a : ''; en.value = dentro && n ? n : '';
        });
        var na = document.getElementById('a_' + t + '_Noche'), nn = document.getElementById('n_' + t + '_Noche');
        if (na) { na.value = a || ''; nn.value = n || ''; }
      });
      total(); toast('Rellenado. Revisa los días y pulsa Guardar.');
    };
    $('#svGuardar').onclick = function () {
      if (S.sinConexion) return toast('Sin conexión.', true);
      var g2 = { entidad: $('#gEnt').value, cif: $('#gCif').value, direccion: $('#gDir').value, representante: $('#gRep').value, dni: $('#gDni').value, cargo: $('#gCar').value, senal: $('#gSen').value };
      cargando(true);
      usarDB(function () { return DB.guardarServicios(r.id, leer(), g2); }).then(function () { toast('Servicios guardados'); ir('reserva/' + encodeURIComponent(r.id)); })
        .catch(function (e) { toast(e.message, true); }).then(function () { cargando(false); });
    };
  }

  function calcularHoja(r) {
    var sv = r.servicios || [], suma = {};
    sv.forEach(function (x) { var k = x.servicio; suma[k] = suma[k] || { a: 0, n: 0, dias: 0 }; suma[k].a += x.adultos; suma[k].n += x.ninos; suma[k].dias++; });
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
    var adMax = 0, niMax = 0; (r.servicios || []).forEach(function (x) { if (SALAS.indexOf(x.servicio) < 0) { adMax = Math.max(adMax, x.adultos); niMax = Math.max(niMax, x.ninos); } });
    function celda(t, sv) { var x = m[t + '|' + sv]; return x && (x.adultos || x.ninos) ? x.adultos + (x.ninos ? ' <small>+ ' + x.ninos + ' niños</small>' : '') : '—'; }
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
      '<div><small>PERSONAS</small>' + adMax + ' adultos' + (niMax ? ' · ' + niMax + ' niños (' + (gratis + 1) + ' a ' + (adulto - 1) + ' años)' : '') + '</div>' +
      '<div><small>ENTIDAD Y CIF</small>' + (esc(g.entidad) || '—') + (g.cif ? ' · ' + esc(g.cif) : '') + (g.direccion ? '<br>' + esc(g.direccion) : '') + '</div></div>' +
      (r.servicios && r.servicios.length ? '' : '<p class="hd-aviso">Todavía no hay servicios apuntados para esta reserva.</p>') +
      '<h4>Servicios por día</h4><table class="hd-tabla"><tr><th class="l">Día</th>' + COMIDAS.map(function (cm) { return '<th>' + cm[0] + '</th>'; }).join('') + (aloj ? '<th>Noche</th>' : '') + '<th class="l">Salas</th></tr>' + filas + '</table>' +
      '<h4>Importe</h4><table class="hd-tabla"><tr><th class="l">Concepto</th><th class="r">Unidades</th><th class="r">Precio</th><th class="r">Importe</th></tr>' +
      c.lineas.map(function (l) { return '<tr><td class="l">' + esc(l.txt) + '</td><td class="r">' + l.u + '</td><td class="r">' + euros(l.p) + '</td><td class="r">' + (l.imp == null ? '—' : euros(l.imp)) + '</td></tr>'; }).join('') +
      (c.lineas.length ? '' : '<tr><td class="l" colspan="4">—</td></tr>') + '</table>' +
      '<div class="hd-fin"><div class="hd-cond"><b>Condiciones</b><br>Niños de 0 a ' + gratis + ' años: gratis. De ' + (gratis + 1) + ' a ' + (adulto - 1) + ' años: precio de niño. A partir de ' + adulto + ' años: como adulto.<br>' +
      (cfgNum('precio.solo_uso') != null ? 'Solo uso de la casa (calefacción, luz, agua…): ' + euros(cfgNum('precio.solo_uso')) + ' por persona.<br>' : '') + esc(cfg('texto.condiciones')) + '</div>' +
      '<div class="hd-tot"><div><span>Total' + (c.consultar ? '*' : '') + '</span><b>' + euros(c.total) + '</b></div><div><span>Señal pagada</span><span>' + euros(c.senal) + '</span></div>' +
      '<div class="hd-pend"><b>Pendiente</b><b>' + euros(c.pendiente) + '</b></div>' + (c.consultar ? '<small>* Sin incluir los conceptos «a consultar».</small>' : '') + '</div></div>' +
      '<div class="hd-pie">' + pie + '<br><span>' + (liq ? 'Cantidades realmente servidas, revisadas por el gestor.' : 'Calculado con los servicios previstos. La liquidación final se hará con lo realmente servido.') + '</span></div>' +
      '</div>';
  }

  function pintarHoja(id, modo) {
    var r = reserva(id);
    if (!r) { vista.innerHTML = botonVolver() + '<div class="vacio">La reserva no existe.</div>'; enlazarVolver(); return; }
    modo = modo === 'liquidacion' ? 'liquidacion' : 'presupuesto';
    vista.innerHTML = botonVolver() +
      '<div class="hoja-barra"><div class="segmento" id="hModo"><button type="button" data-m="presupuesto"' + (modo === 'presupuesto' ? ' class="activo"' : '') + '>Presupuesto</button><button type="button" data-m="liquidacion"' + (modo === 'liquidacion' ? ' class="activo"' : '') + '>Liquidación</button></div>' +
      '<div class="fila-btns"><button class="btn sec" id="hServ">Corregir servicios</button><button class="btn sec" id="hXls">Descargar Excel</button><button class="btn" id="hPdf">Imprimir / PDF</button></div></div>' +
      '<div class="hoja-marco">' + htmlHoja(r, modo) + '</div>';
    enlazarVolver();
    $('#hModo').onclick = function (e) { var b = e.target.closest('button'); if (b) ir('hoja/' + encodeURIComponent(r.id) + '?modo=' + b.dataset.m); };
    $('#hServ').onclick = function () { ir('servicios/' + encodeURIComponent(r.id)); };
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
      // Columnas: Día + (adultos, niños) por servicio + Salas
      var serv = COMIDAS.map(function (x) { return x[0]; }); if (aloj) serv.push('Noche');
      var nCol = 2 + serv.length * 2; // A = día, luego pares, última = salas
      var anchos = [16]; serv.forEach(function () { anchos.push(9, 9); }); anchos.push(22); anchos[nCol - 2] = Math.max(anchos[nCol - 2], 12); anchos[nCol - 3] = Math.max(anchos[nCol - 3], 10);
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
      var adMax = 0, niMax = 0; (r.servicios || []).forEach(function (x) { if (SALAS.indexOf(x.servicio) < 0) { adMax = Math.max(adMax, x.adultos); niMax = Math.max(niMax, x.ninos); } });
      [['Grupo', r.grupo],
       ['Responsable', [r.responsable, r.telefono, r.email].filter(Boolean).join(' · ') || '—'],
       ['Entrada', diaSemana(r.entrada) + ', ' + r.horaEntrada],
       ['Salida', diaSemana(r.salida) + ', ' + r.horaSalida],
       ['Personas', adMax + ' adultos' + (niMax ? ' · ' + niMax + ' niños (' + (gratis + 1) + ' a ' + (adulto - 1) + ' años)' : '')],
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
      serv.forEach(function (s, i) { var col = 1 + i * 2; ws.getCell(L(col) + f1).value = s; unir(f1, col, col + 1); ws.getCell(L(col) + f2).value = 'Adultos'; ws.getCell(L(col + 1) + f2).value = 'Niños'; });
      ws.getCell(UL + f1).value = 'Salas'; ws.mergeCells(UL + f1 + ':' + UL + f2);
      [f1, f2].forEach(function (f) { for (var k = 0; k < nCol; k++) { var x = ws.getCell(L(k) + f); x.font = { bold: true, size: f === f1 ? 9.5 : 8.5, color: { argb: 'FF444444' } }; x.alignment = { horizontal: k === 0 || k === nCol - 1 ? 'left' : 'center', vertical: 'middle' }; x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUAVE } }; } });
      for (k = 0; k < nCol; k++) borde(ws.getCell(L(k) + f2), true);
      fila = f2 + 1;
      var fIni = fila;
      dias.forEach(function (t, di) {
        ws.getCell('A' + fila).value = diaCorto(t); ws.getCell('A' + fila).font = { bold: true };
        serv.forEach(function (s, i) {
          var x = m[t + '|' + s] || {}, col = 1 + i * 2;
          var ca = ws.getCell(L(col) + fila), cn = ws.getCell(L(col + 1) + fila);
          ca.value = x.adultos || null; cn.value = x.ninos || null;
          ca.alignment = cn.alignment = { horizontal: 'center' };
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
      var porServ = {}; (r.servicios || []).forEach(function (x) { var q = porServ[x.servicio] = porServ[x.servicio] || { a: 0, n: 0, d: 0 }; q.a += x.adultos; q.n += x.ninos; q.d++; });
      var conceptos = [];
      [['Desayuno', 'desayuno', 'Desayuno'], ['Comida', 'comida', 'Comida'], ['Cena', 'cena', 'Cena'], ['Noche', 'noche', 'Alojamiento (noche)']].forEach(function (cx) {
        var i = serv.indexOf(cx[0]); if (i < 0) return; var q = porServ[cx[0]] || { a: 0, n: 0 };
        conceptos.push({ txt: cx[2] + ' · adulto', f: 'SUM(' + rango(L(1 + i * 2)) + ')', u: q.a, p: cfgNum('precio.adulto.' + cx[1]) });
        conceptos.push({ txt: cx[2] + ' · niño', f: 'SUM(' + rango(L(2 + i * 2)) + ')', u: q.n, p: cfgNum('precio.nino.' + cx[1]) });
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
      var fS = tot('Señal pagada', c.senal);
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

  // ---------------- Administración (solo administradores) ----------------
  function pintarAdmin() {
    if (!S.datos.esAdmin) { vista.innerHTML = botonVolver() + '<div class="vacio">Solo los administradores pueden ver esta pantalla.</div>'; enlazarVolver(); return; }
    var cfg = S.datos.config || [], grupos = [], por = {}, orig = {};
    cfg.forEach(function (a) { orig[a.clave] = a.valor; if (!por[a.grupo]) { por[a.grupo] = []; grupos.push(a.grupo); } por[a.grupo].push(a); });
    function campo(a) {
      var id = 'ad_' + a.clave.replace(/\W/g, '_');
      var etiqueta = esc(a.descripcion) + (a.tipo === 'euros' ? ' (€)' : '');
      if (a.tipo === 'largo') return '<label class="campo"><span>' + etiqueta + '</span><textarea class="entrada" id="' + id + '" data-k="' + esc(a.clave) + '" maxlength="2000">' + esc(a.valor) + '</textarea></label>';
      var extra = a.tipo === 'euros' ? ' inputmode="decimal" placeholder="a consultar"' : a.tipo === 'num' ? ' inputmode="numeric"' : ' maxlength="120"';
      return '<label class="campo"><span>' + etiqueta + '</span><input class="entrada" id="' + id + '" data-k="' + esc(a.clave) + '" value="' + esc(a.valor) + '"' + extra + ' autocomplete="off"></label>';
    }
    vista.innerHTML = botonVolver() +
      '<div class="aviso-suave">Solo para administradores. Los cambios valen para los documentos que se hagan a partir de ahora; los ya enviados no cambian. Un precio vacío sale como «a consultar».</div>' +
      grupos.map(function (g) { return '<div class="tarjeta"><h2>' + esc(g) + '</h2>' + por[g].map(campo).join('') + '</div>'; }).join('') +
      '<div class="form-espacio"></div><div class="pie-form"><div class="total" id="adEstado">Sin cambios</div><button class="btn" id="adGuardar">Guardar cambios</button></div>';
    function cambios() {
      var v = {};
      $$('[data-k]').forEach(function (el) { var k = el.dataset.k; if (String(el.value).trim() !== String(orig[k] == null ? '' : orig[k]).trim()) v[k] = el.value; });
      return v;
    }
    vista.oninput = function () { var est = $('#adEstado'); if (!est) return; var n = Object.keys(cambios()).length; est.textContent = n ? n + (n === 1 ? ' cambio sin guardar' : ' cambios sin guardar') : 'Sin cambios'; };
    enlazarVolver();
    $('#adGuardar').onclick = function () {
      var v = cambios(), n = Object.keys(v).length;
      if (!n) return toast('No hay cambios que guardar.');
      if (S.sinConexion) return toast('Sin conexión.', true);
      cargando(true);
      usarDB(function () { return DB.guardarAjustes(v); }).then(function (d) { toast('Guardado · ' + d.cambios + (d.cambios === 1 ? ' cambio' : ' cambios')); pintarAdmin(); })
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
      '<button class="btn peligro ancho" id="aSalir">Cerrar sesión en este móvil</button>' +
      '<p class="sub" style="text-align:center;font-size:12px;margin-top:18px">App ' + VERSION + ' · Puente ' + esc(aj.version || '1.0.0') + (DEMO ? ' · demostración' : '') + '</p>';
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
    if (b.dataset.ir === 'calendario') S.mes = null;
    ir(b.dataset.ir);
  };
  $('#btnRecargar').onclick = function () { recargar(); };
  window.addEventListener('hashchange', pintar);
  // Al volver a la app: actualizar datos sin borrar lo que se esté escribiendo.
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.clave && S.datos) recargar(true); });
  avisoConexion();

  S.clave = lsGet('clave'); S.gestor = lsGet('gestor');
  if (S.clave) {
    var c = lsGet('cache');
    if (c) { S.datos = c.datos; pintar(); }
    recargar(!!c);
  } else pintarLogin();

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
