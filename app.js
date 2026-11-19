/* Casa María Madre – app de gestión de ocupación (v1.1) */
(function () {
  'use strict';
  var C = window.CONFIG || {};
  var DEMO = !C.API_URL;
  var VERSION = '1.4.0';
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

  // ---------------- Comunicación con Google (o demostración) ----------------
  var demoListo = null;
  function cargarScript(src) {
    return new Promise(function (ok, ko) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { ko(new Error('No se encuentra el archivo ' + src + '. ¿Se subió la carpeta «demo» a GitHub?')); }; document.head.appendChild(s); });
  }
  function prepararDemo() {
    if (!demoListo) {
      demoListo = cargarScript('demo/gas-mock.js').then(function () { return cargarScript('demo/codigo.js'); }).then(function () {
        window.CLAVE_ACCESO = 'demo';
        if (!lsGet('demoIniciada2')) {
          window.__GAS_RESET__ && window.__GAS_RESET__();
          window.configurar();
          var p = function (d) { return window.atender({ clave: 'demo', gestor: 'Demo', accion: 'guardarReserva', datos: d }); };
          var e1 = sumaDias(hoyTxt(), 5);
          p({ reserva: { grupo: 'Retiro parroquial (ejemplo)', responsable: 'Ana López', telefono: '600000000', email: 'ana@ejemplo.es', entrada: e1, salida: sumaDias(e1, 2), estado: 'Confirmada' },
            asignaciones: [{ habitacion: 16, personas: 3 }, { habitacion: 17, personas: 3 }, { habitacion: 19, personas: 5 }, { habitacion: 11, personas: 2 }] });
          p({ reserva: { grupo: 'Lectura creyente (ejemplo)', tipo: 'Día / sala', responsable: 'Óscar M.', entrada: sumaDias(e1, 1), horaEntrada: '10:00', salida: sumaDias(e1, 1), horaSalida: '13:00', estado: 'Confirmada' } });
          var e2 = sumaDias(e1, 16);
          p({ reserva: { grupo: 'Ejercicios espirituales (ejemplo)', responsable: 'Luis Pérez', telefono: '611111111', entrada: e2, salida: sumaDias(e2, 3) },
            asignaciones: [{ habitacion: 23, personas: 4 }, { habitacion: 24, personas: 4 }, { habitacion: 25, personas: 3 }] });
          p({ reserva: { tipo: 'Bloqueo', grupo: 'DESCANSO', entrada: sumaDias(e2, 7), salida: sumaDias(e2, 8), estado: 'Confirmada' } });
          var r = p({ reserva: { grupo: 'Grupo anulado (ejemplo)', responsable: 'Paqui', email: 'paqui@ejemplo.es', entrada: sumaDias(e1, 9), salida: sumaDias(e1, 11) } });
          if (r && r.ok) window.atender({ clave: 'demo', gestor: 'Demo', accion: 'cancelarReserva', datos: { id: r.datos.id } });
          lsSet('demoIniciada2', true);
        }
      });
    }
    return demoListo;
  }

  function api(accion, datos) {
    var pet = { clave: S.clave, gestor: S.gestor, accion: accion, datos: datos || {} };
    var p = DEMO
      ? prepararDemo().then(function () { return new Promise(function (ok) { setTimeout(function () { ok(window.atender(JSON.parse(JSON.stringify(pet)))); }, 200); }); })
      : fetch(C.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(pet), redirect: 'follow' })
          .then(function (r) { if (!r.ok) throw new Error('El servidor respondió ' + r.status); return r.json(); })
          .catch(function (e) { if (e instanceof TypeError) { var x = new Error(navigator.onLine === false ? 'Sin conexión. Revisa la cobertura e inténtalo de nuevo.' : 'No se pudo conectar con Google. Revisa que API_URL termine en /exec y que el script esté implementado para «Cualquier usuario».'); x.red = true; throw x; } if (e instanceof SyntaxError) throw new Error('Google no devolvió datos válidos. Revisa la implementación del script.'); throw e; });
    return p.then(function (r) {
      if (!r || !r.ok) { var err = new Error((r && r.error) || 'Error desconocido'); err.codigo = r && r.codigo; throw err; }
      if (r.datos && r.datos.estado) fijarDatos(r.datos.estado);
      if (accion === 'inicial') fijarDatos(r.datos);
      return r.datos;
    });
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
    return api('inicial').then(function () { if (!editando()) pintar(); })
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
  var TITULOS = { calendario: 'Calendario', reservas: 'Reservas', nueva: 'Nueva reserva', editar: 'Editar reserva', reserva: 'Reserva', ajustes: 'Ajustes' };
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
      b.classList.toggle('activo', b.dataset.ir === r.vista || (b.dataset.ir === 'reservas' && r.vista === 'reserva'));
    });
    vista.scrollTop = 0; window.scrollTo(0, 0);
    switch (r.vista) {
      case 'reservas': return pintarReservas();
      case 'reserva': return pintarDetalle(r.id);
      case 'nueva': return pintarFormulario(null, r.q);
      case 'editar': return pintarFormulario(r.id, r.q);
      case 'ajustes': return pintarAjustes();
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
      api('inicial').then(function () {
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
      semanas += '<div class="semana" style="grid-template-rows:22px repeat(' + Math.max(1, Math.min(carriles.length, MAXC)) + ',auto)' + (ocultos.some(Boolean) ? ' 16px' : '') + ' 4px">' + celdas + franjas + mas + '</div>';
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
    function accion(nombre, texto, boton, ok) {
      return function () {
        if (S.sinConexion) return toast('Sin conexión: no se puede hacer ahora.', true);
        confirmar(texto, boton, true).then(function (si) {
          if (!si) return;
          cargando(true);
          api(nombre, { id: r.id }).then(function () { toast(ok); ir('calendario'); })
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
        api('guardarReserva', { reserva: d, asignaciones: asignaciones })
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
  function pintarAjustes() {
    var c = lsGet('cache'), aj = S.datos.ajustes || {};
    vista.innerHTML =
      '<div class="tarjeta"><h2>Sesión</h2><div class="dato"><span>Has entrado como</span><span><b>' + esc(S.gestor || '') + '</b></span></div>' +
      '<p class="sub" style="margin:10px 0 0">Queda anotado en cada reserva que crees o modifiques. Para entrar como otra persona, cierra la sesión y entra con su clave.</p></div>' +
      '<div class="tarjeta"><h2>Casa</h2>' +
      '<div class="dato"><span>Habitaciones disponibles</span><span>' + habitaciones().filter(function (h) { return h.estado === 'Disponible'; }).length + ' de ' + habitaciones().length + '</span></div>' +
      '<div class="dato"><span>Plazas disponibles</span><span>' + capacidadDisponible() + '</span></div>' +
      '<div class="dato"><span>Horario por defecto</span><span>Entrada ' + esc(aj.horaEntrada || '12:00') + ' · Salida ' + esc(aj.horaSalida || '16:00') + '</span></div></div>' +
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
          api(nombre).then(function (d) { toast(fmt(d)); pintarAjustes(); })
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
