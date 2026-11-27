/* Formulario del grupo · Casa María Madre
   Página pública: se abre con el enlace propio de cada reserva (formulario.html#<enlace>).
   No usa ninguna clave de gestor: los datos van y vienen solo con ese enlace, a través de database.js. */
(function () {
  'use strict';
  var TOKEN = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var vista = $('#fgVista'), pie = $('#fgPie');
  // 2.5.3: las horas vienen de Administración › Horarios de las comidas
  function hora(sv, def) { var v = aj('hora.' + sv.toLowerCase()).trim(); if (/^\d:\d{2}$/.test(v)) v = '0' + v; return /^\d{2}:\d{2}$/.test(v) ? v : def; }
  function comidas() { return [['Desayuno', hora('Desayuno', '09:00')], ['Comida', hora('Comida', '14:00')], ['Cena', hora('Cena', '21:00')]]; }
  var DSEM = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  var INFO = null, F = null, paso = 1;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function aFecha(t) { var p = t.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function suma(t, n) { var d = aFecha(t); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function legible(t) { var p = t.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function corto(t) { var d = aFecha(t); return DSEM[d.getDay()] + ' ' + d.getDate(); }
  function toast(m, error) { var t = $('#fgToast'); t.textContent = m; t.className = 'fg-toast' + (error ? ' error' : ''); t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 3500); }
  function num(v) { return Math.max(0, Math.min(999, Math.floor(+v || 0))); }
  function aj(k) { return (INFO && INFO.ajustes && INFO.ajustes[k] != null) ? String(INFO.ajustes[k]) : ''; }
  function precio(k) { var v = aj(k).replace(',', '.'); return v === '' || isNaN(+v) ? null : +v; }

  // ---------------- Carga ----------------
  if (!TOKEN) return mensaje('Falta el enlace', 'Abra el formulario desde el enlace que le envió la Casa.');
  DB.leerFormulario(TOKEN).then(function (d) {
    INFO = d;
    if (!d.abierto) return mensaje('Formulario no disponible', d.motivo || 'Para cualquier cambio, contacte con la Casa.');
    var r = d.reserva;
    if (!r) return mensaje('Enlace no válido', 'Pida a la Casa un enlace nuevo.');
    $('#fgGrupo').textContent = r.grupo + ' · ' + legible(r.entrada) + ' a ' + legible(r.salida);
    preparar();
    pintar();
  }).catch(function (e) {
    mensaje(e.codigo === 'ENLACE' ? 'Enlace no válido' : 'No se pudo abrir', e.message || 'Inténtelo de nuevo más tarde.');
  });

  function mensaje(tit, txt) {
    $('#fgBarra').hidden = true; pie.hidden = true; $('#fgPaso').textContent = '';
    vista.innerHTML = '<div class="card fin"><h2>' + esc(tit) + '</h2><p class="hint">' + esc(txt) + '</p>' +
      (aj('casa.telefono') ? '<p class="hint">Teléfono de la Casa: <a href="tel:' + esc(aj('casa.telefono').replace(/\s/g, '')) + '">' + esc(aj('casa.telefono')) + '</a></p>' : '') + '</div>';
  }

  // ---------------- Estado del formulario ----------------
  function dias() { var r = INFO.reserva, out = [], t = r.entrada; while (t <= r.salida) { out.push(t); t = suma(t, 1); } return out; }
  function aloj() { return INFO.reserva.tipo === 'Alojamiento'; }
  /** Servicios que caen dentro del horario de la estancia: { 'fecha|servicio': true } */
  function serviciosPosibles() {
    var r = INFO.reserva, ds = dias(), out = {}, he = r.horaEntrada || '12:00', hs = r.horaSalida || '16:00';
    ds.forEach(function (t, i) {
      comidas().forEach(function (c) { if ((t > r.entrada || c[1] >= he) && (t < r.salida || c[1] <= hs)) out[t + '|' + c[0]] = true; });
      if (aloj() && i < ds.length - 1) out[t + '|Noche'] = true;
    });
    return out;
  }
  function preparar() {
    var r = INFO.reserva, e = INFO.enviado, g = r.grupoDatos || {};
    if (e) { F = JSON.parse(JSON.stringify(e)); F.servMap = {}; (e.servicios || []).forEach(function (x) { F.servMap[x.fecha + '|' + x.servicio] = x.total; }); F.salaSet = {}; (e.salas || []).forEach(function (x) { F.salaSet[x.fecha + '|' + x.sala] = true; }); F.hayAlergias = (e.alergias || []).length > 0; F.alergias = F.alergias || [];
      F.contacto = Object.assign({ responsable: r.responsable || '', telefono: r.telefono || '', email: r.email || '' }, F.contacto || {});
      F.habitaciones = Object.assign({ matrimonios: 0, comparten: 0, individual: 0, literas: 0, movilidad: 0, observaciones: '' }, F.habitaciones || {});
      if (F.habitaciones.movilidad) { F.habitaciones.comparten += F.habitaciones.movilidad; F.habitaciones.movilidad = 0; }
      F.consentimientos = F.consentimientos || { datos: false, imagenes: false, autorizacion: false }; return; }
    F = {
      contacto: { responsable: r.responsable || '', telefono: r.telefono || '', email: r.email || '' },
      grupo: { entidad: g.entidad || '', cif: g.cif || '', direccion: g.direccion || '', representante: g.representante || '', dni: g.dni || '', cargo: g.cargo || '' },
      personas: { adultos: r.personas || 0, ninos: 0, bebes: 0 },
      servMap: {}, salaSet: {},
      habitaciones: { matrimonios: 0, comparten: 0, individual: 0, literas: 0, movilidad: 0, observaciones: '' },
      hayAlergias: null, alergias: [],
      consentimientos: { datos: false, imagenes: false, autorizacion: false }
    };
    (r.servicios || []).forEach(function (x) { if (INFO.salas.indexOf(x.servicio) >= 0) F.salaSet[x.fecha + '|' + x.servicio] = true; });
    rellenarServicios();
  }
  /** Todos los que comen y duermen (también los de 0 a 4, que son gratis). */
  function totalPersonas() { return F.personas.adultos + F.personas.ninos + F.personas.bebes; }
  /** Los que necesitan cama (los de 0 a 4 no cuentan para el reparto de habitaciones). */
  function personasCama() { return F.personas.adultos + F.personas.ninos; }
  var AVISO_BEBES = 'Si tienen alguna necesidad para los bebés, consúltenos.';
  function rellenarServicios(anterior) {
    var pos = serviciosPosibles(), tot = totalPersonas();
    Object.keys(pos).forEach(function (k) { if (anterior == null || F.servMap[k] == null || F.servMap[k] === anterior) F.servMap[k] = tot; });
  }

  // ---------------- Pintar ----------------
  function stepper(id, valor, titulo, ayuda) {
    return '<div class="paso-fila"><div><div class="t">' + titulo + '</div>' + (ayuda ? '<div class="hint">' + ayuda + '</div>' : '') + '</div>' +
      '<div class="stp"><button type="button" data-st="' + id + '" data-d="-1" aria-label="Quitar uno: ' + esc(titulo) + '">−</button><output id="o_' + id + '">' + valor + '</output>' +
      '<button type="button" data-st="' + id + '" data-d="1" aria-label="Añadir uno: ' + esc(titulo) + '">+</button></div></div>';
  }
  function campo(id, etiqueta, valor, tipo, ro, ob) {
    var v = String(valor == null ? '' : valor).trim();
    return '<label class="f" for="' + id + '">' + etiqueta + (ob ? ' * <span class="falta-av" id="av_' + id + '"' + (v ? ' hidden' : '') + '>Falta</span>' : '') + '</label>' +
      '<input id="' + id + '" type="' + (tipo || 'text') + '" value="' + esc(valor) + '"' + (ro ? ' readonly' : ' autocomplete="off"') + '>';
  }
  function eur(n) { n = Math.round((Number(n) || 0) * 100) / 100; return n.toLocaleString('es-ES', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2, useGrouping: 'always' }) + ' €'; }
  function avisoSenal() {
    var s = INFO.senal;
    if (!s || s.pagada || s.comprobante) return '';
    var r = INFO.reserva || {};
    var concepto = 'Fianza – ' + (r.grupo || '') + ' – ' + (r.entrada ? legible(r.entrada) : '');
    return '<div class="card senal-aviso"><div class="card-tit pri">Fianza pendiente</div>' +
      '<div class="hint" style="margin-bottom:6px">Para confirmar la reserva, recuerde abonar la fianza' + (s.enlaceFirma ? ' y adjuntar el comprobante' : '') + ':</div>' +
      (s.importe ? '<div class="pre-fila"><span>Importe</span><b>' + eur(s.importe) + '</b></div>' : '') +
      (s.iban ? '<div class="pre-fila"><span>Cuenta (IBAN)</span><b>' + esc(s.iban) + '</b></div>' : '') +
      '<div class="pre-fila"><span>Concepto</span><b>' + esc(concepto) + '</b></div>' +
      (s.enlaceFirma ? '<div style="margin-top:8px"><a class="b-enl-firma" href="' + esc(s.enlaceFirma) + '">Ir a la página de presupuesto y condiciones para adjuntar el comprobante ›</a></div>' : '') +
      '</div>';
  }

  function pintar() {
    $('#fgPaso').textContent = 'Paso ' + paso + ' de 4';
    $('#fgBarra').hidden = false;
    $$('#fgBarra span').forEach(function (s, i) { s.classList.toggle('on', i < paso); });
    vista.innerHTML = [null, paso1, paso2, paso3, paso4][paso]();
    pie.hidden = false;
    pie.innerHTML = (paso > 1 ? '<button type="button" class="b-sec" id="bAtras">Atrás</button>' : '') +
      '<button type="button" class="b-pri" id="bSig">' + (paso < 4 ? 'Siguiente' : 'Enviar a la Casa') + '</button>';
    if ($('#bAtras')) $('#bAtras').onclick = function () { leer(); paso--; pintar(); window.scrollTo(0, 0); };
    $('#bSig').onclick = function () { leer(); if (paso < 4) { paso++; pintar(); window.scrollTo(0, 0); } else enviar(); };
    enlazar();
  }

  function paso1() {
    var r = INFO.reserva, g = F.grupo, c = F.contacto;
    return avisoSenal() +
      '<div><h2>Datos del grupo</h2><div class="hint">Los datos en gris ya los tiene la Casa. Revise y complete el resto.</div></div>' +
      '<div class="card">' + campo('cGrupo', 'Grupo', r.grupo, 'text', true) +
      campo('cResp', 'Responsable', c.responsable != null ? c.responsable : (r.responsable || ''), 'text', false, true) +
      campo('cTel', 'Teléfono', c.telefono, 'tel', false, true) +
      campo('cEmail', 'Correo electrónico', c.email, 'email', false, true) + '</div>' +
      '<div class="card"><div class="card-tit pri">Para la factura y el contrato (opcional)</div>' +
      campo('gEnt', 'Entidad (nombre legal)', g.entidad) + campo('gCif', 'CIF', g.cif) + campo('gDir', 'Dirección', g.direccion) +
      campo('gRep', 'Representante que firma', g.representante) + campo('gDni', 'DNI del representante', g.dni) + campo('gCar', 'Cargo', g.cargo) + '</div>';
  }

  function paso2() {
    var ds = dias(), pos = serviciosPosibles();
    var filas = comidas().map(function (c) { return c[0]; }).concat(aloj() ? ['Noche'] : []).map(function (sv) {
      return '<tr><th class="l">' + sv + '</th>' + ds.map(function (t) {
        var k = t + '|' + sv;
        return '<td>' + (pos[k] ? '<input type="text" inputmode="numeric" data-sv="' + k + '" aria-label="' + sv + ' ' + corto(t) + '" value="' + (F.servMap[k] || 0) + '">' : '—') + '</td>';
      }).join('') + '</tr>';
    }).join('');
    var salas = INFO.salas.map(function (sa) {
      return '<tr><th class="l">' + sa + '</th>' + ds.map(function (t) { var k = t + '|' + sa; return '<td><input type="checkbox" data-sala="' + k + '" aria-label="' + sa + ' ' + corto(t) + '"' + (F.salaSet[k] ? ' checked' : '') + '></td>'; }).join('') + '</tr>';
    }).join('');
    var cab = '<tr><th></th>' + ds.map(function (t) { return '<th>' + corto(t) + '</th>'; }).join('') + '</tr>';
    var gratis = aj('edad.gratis_hasta') || '4', adulto = aj('edad.adulto_desde') || '9';
    return '<div><h2>Personas y servicios</h2><div class="hint">Solo número de personas. No necesitamos nombres ni edades.</div></div>' +
      '<div class="card">' + stepper('adultos', F.personas.adultos, 'Adultos', 'Desde ' + adulto + ' años') +
      stepper('ninos', F.personas.ninos, 'Niños de ' + (+gratis + 1) + ' a ' + (+adulto - 1) + ' años') +
      stepper('bebes', F.personas.bebes, 'Niños de 0 a ' + gratis + ' años', 'Gratis') +
      (F.personas.bebes ? '<div class="hint" style="padding:8px 0 2px">' + AVISO_BEBES + '</div>' : '') + '</div>' +
      '<div class="card"><div class="card-tit">¿Cuántos en cada servicio?</div><div class="hint" style="margin-bottom:6px">Ya está rellenado con el total de personas según el horario' + (F.personas.bebes ? ', <b>incluidos los niños de 0 a ' + gratis + ' años</b>' : '') + '. Cambie solo lo que no sea así.</div>' +
      '<div class="tabla-wrap"><table class="g">' + cab + filas + '</table></div></div>' +
      '<div class="card"><div class="card-tit">Salas</div><div class="hint" style="margin-bottom:6px">Marque los días que necesitan cada espacio.</div><div class="tabla-wrap"><table class="g">' + cab + salas + '</table></div></div>' +
      '<div class="card"><div class="card-tit">Alergias e intolerancias</div><div class="hint">Para la cocina. Cada persona se indica con una letra (A, B…): no escriba nombres.</div>' +
      '<div style="font-size:14px;margin-top:10px">¿Alguna persona del grupo tiene alergias?</div>' +
      '<div class="seg"><button type="button" data-al="no" class="' + (F.hayAlergias === false ? 'on' : '') + '">No</button><button type="button" data-al="si" class="' + (F.hayAlergias ? 'on' : '') + '">Sí</button></div>' +
      (F.hayAlergias ? stepper('nAler', F.alergias.length, 'Personas con alergias', 'Aparece una ficha por persona') + F.alergias.map(fichaAlergia).join('') : '') + '</div>';
  }
  function letra(i) { var s = ''; i++; while (i > 0) { var k = (i - 1) % 26; s = String.fromCharCode(65 + k) + s; i = Math.floor((i - 1) / 26); } return s; }
  function fichaAlergia(a, i) {
    return '<div class="per"><div class="per-cab"><div class="t" style="font-size:15px;font-weight:700">Persona ' + letra(i) + '</div><span class="hint">' + (a.alergenos.length ? a.alergenos.length + ' marcada' + (a.alergenos.length === 1 ? '' : 's') : '') + '</span></div>' +
      '<div class="algrid">' + INFO.alergenos.map(function (x) {
        var on = a.alergenos.indexOf(x) >= 0;
        return '<label class="al' + (on ? ' on' : '') + '"><input type="checkbox" data-aler="' + i + '" value="' + esc(x) + '"' + (on ? ' checked' : '') + '><span>' + esc(x) + '</span></label>';
      }).join('') + '</div>' +
      '<label class="f" for="ot' + i + '">Otras alergias o intolerancias de la persona ' + letra(i) + '</label><input id="ot' + i + '" type="text" data-otras="' + i + '" value="' + esc(a.otras || '') + '" placeholder="Por ejemplo: miel, kiwi…"></div>';
  }

  function paso3() {
    if (!aloj()) return '<div><h2>Habitaciones</h2></div><div class="card"><p class="hint" style="margin:0">Esta reserva es sin alojamiento: no hace falta indicar habitaciones. Pulse «Siguiente».</p></div>';
    var h = F.habitaciones;
    return '<div><h2>Habitaciones</h2><div class="hint">Díganos cómo prefieren repartirse. La Casa asignará las habitaciones concretas.</div></div>' +
      '<div class="card">' + stepper('matrimonios', h.matrimonios, 'Matrimonios', 'Una habitación doble por pareja') +
      stepper('comparten', h.comparten, 'Personas que comparten habitación', 'De dos en dos') +
      stepper('individual', h.individual, 'Personas en habitación individual', 'Según disponibilidad') +
      stepper('literas', h.literas, 'Jóvenes en literas', 'Habitaciones de 4') + '</div>' +
      '<div id="reparto">' + htmlReparto() + '</div>' +
      '<div class="card"><label class="f" for="hObs" style="margin-top:0">Observaciones (opcional)</label>' +
      (F.personas.bebes ? '<div class="hint" style="margin-bottom:6px">' + AVISO_BEBES + '</div>' : '') +
      '<textarea id="hObs" maxlength="300">' + esc(h.observaciones || '') + '</textarea></div>';
  }
  function htmlReparto() {
    var h = F.habitaciones, n = h.matrimonios * 2 + h.comparten + h.individual + h.literas, t = personasCama();
    return (n === t ? '<div class="ok-box">✓ ' + n + ' de ' + t + ' personas repartidas</div>' :
      '<div class="av-box">' + n + ' de ' + t + ' personas repartidas' + (n > t ? ' (sobran ' + (n - t) + ')' : ' (faltan ' + (t - n) + ')') + '. Puede enviarlo igualmente; la Casa lo revisará.</div>') +
      (F.personas.bebes ? '<div class="hint" style="margin-top:6px">Los niños de 0 a ' + (aj('edad.gratis_hasta') || 4) + ' años no se cuentan aquí.</div>' : '');
  }

  function calculo() {
    var s = { a: 0, n: 0 }, total = 0, falta = false;
    // Cada casilla es el total; se reparte igual que lo hará la Casa: primero los de 0 a 4 (gratis), luego los niños, el resto adultos.
    var pos = serviciosPosibles();
    var tot = {}; Object.keys(F.servMap).forEach(function (k) { if (!pos[k]) return; var sv = k.split('|')[1]; var v = F.servMap[k] || 0; var be = Math.min(F.personas.bebes, v); var ni = Math.min(F.personas.ninos, v - be);
      tot[sv] = tot[sv] || { a: 0, n: 0, b: 0 }; tot[sv].a += v - be - ni; tot[sv].n += ni; tot[sv].b += be; });
    [['Desayuno', 'desayuno'], ['Comida', 'comida'], ['Cena', 'cena'], ['Noche', 'noche']].forEach(function (c) {
      var x = tot[c[0]]; if (!x) return;
      var pa = precio('precio.adulto.' + c[1]), pn = precio('precio.nino.' + c[1]);
      if ((x.a && pa == null) || (x.n && pn == null)) falta = true;
      total += x.a * (pa || 0) + x.n * (pn || 0);
    });
    return { total: Math.round(total * 100) / 100, falta: falta, tot: tot };
  }
  /** 2.5.3: presupuesto resumido (una línea por servicio, total y total por persona entre los que pagan). */
  function pl(n, s, p) { return n + ' ' + (n === 1 ? s : p); }
  function htmlPresupuesto() {
    var p = F.personas, c = calculo(), t = c.tot, n = totalPersonas();
    if (!n) return '<div class="card"><div class="card-tit pri">Presupuesto estimado</div><p class="hint" style="margin:0">Sin número de personas no se puede hacer el presupuesto.</p></div>';
    var filas = [['Desayuno', 'desayuno', 'Desayunos'], ['Comida', 'comida', 'Comidas'], ['Cena', 'cena', 'Cenas'], ['Noche', 'noche', 'Alojamiento']].map(function (k) {
      var x = t[k[0]]; if (!x) return '';
      var pa = precio('precio.adulto.' + k[1]), pn = precio('precio.nino.' + k[1]);
      return '<div class="pre-fila"><span>' + k[2] + '</span><b>' + eur(x.a * (pa || 0) + x.n * (pn || 0)) + '</b></div>';
    }).join('');
    function paga(edad) { return ['desayuno', 'comida', 'cena', 'noche'].some(function (k) { return (precio('precio.' + edad + '.' + k) || 0) > 0; }); }
    var pagan = (paga('adulto') ? p.adultos : 0) + (paga('nino') ? p.ninos : 0);
    return '<div class="card"><div class="card-tit pri">Presupuesto estimado</div>' +
      '<div class="pre-pers"><b>' + pl(n, 'persona', 'personas') + '</b> · ' + pl(p.adultos, 'adulto', 'adultos') + ' · ' + pl(p.ninos, 'niño', 'niños') + ' · ' + pl(p.bebes, 'bebé', 'bebés') + '</div>' + filas +
      '<div class="pre-fila pre-total"><span><b>Total previsto</b></span><b>' + eur(c.total) + '</b></div>' +
      '<div class="pre-fila"><span>Total por persona' + (pagan !== n ? ' <span class="hint">(entre ' + pagan + ' que pagan)</span>' : '') + '</span><b>' + (pagan ? eur(c.total / pagan) : '—') + '</b></div>' +
      '<div class="hint" style="margin-top:6px">Es una estimación de alojamiento y comidas' + (c.falta ? ' (algún precio, a consultar)' : '') + '; las salas se presupuestan aparte. La Casa le enviará el presupuesto actualizado con estos datos.' + (p.bebes ? ' Los bebés (0 a ' + (aj('edad.gratis_hasta') || 4) + ' años) no pagan.' : '') + '</div></div>';
  }
  function paso4() {
    var p = F.personas, c = calculo(), t = c.tot;
    var serv = [];
    if (t.Noche) serv.push((t.Noche.a + t.Noche.n + t.Noche.b) + ' pernoctaciones');
    ['Desayuno', 'Comida', 'Cena'].forEach(function (k) { if (t[k]) serv.push((t[k].a + t[k].n + t[k].b) + ' ' + k.toLowerCase() + 's'); });
    var salas = {}; Object.keys(F.salaSet).forEach(function (k) { if (!F.salaSet[k]) return; var x = k.split('|'); (salas[x[1]] = salas[x[1]] || []).push(corto(x[0])); });
    var h = F.habitaciones, hab = [];
    if (h.matrimonios) hab.push(h.matrimonios + ' matrimonios'); if (h.comparten) hab.push(h.comparten + ' comparten'); if (h.individual) hab.push(h.individual + ' individuales');
    if (h.literas) hab.push(h.literas + ' en literas');
    var al = F.hayAlergias ? F.alergias.filter(function (a) { return a.alergenos.length || a.otras; }) : [];
    var euros = c.total.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2, useGrouping: 'always' }) + ' €';
    var cs = F.consentimientos, TX = INFO.textos || {};
    function leerMas(tit, txt) {
      if (!txt) return '';
      return '<details class="leer"><summary>' + tit + '</summary><div class="leer-txt">' +
        String(txt).split(/\n+/).map(function (pp) { return '<p>' + esc(pp) + '</p>'; }).join('') + '</div></details>';
    }
    return '<div><h2>Revisar y enviar</h2><div class="hint">Compruebe el resumen. Podrá corregirlo con este mismo enlace hasta el día de entrada.</div></div>' +
      '<div class="card resumen">' +
      '<b>Personas:</b> ' + p.adultos + ' adultos' + (p.ninos ? ' · ' + p.ninos + ' niños' : '') + (p.bebes ? ' · ' + p.bebes + ' de 0 a ' + (aj('edad.gratis_hasta') || 4) + ' años' : '') + '<br>' +
      '<b>Servicios:</b> ' + (serv.join(' · ') || '—') + '<br>' +
      '<b>Salas:</b> ' + (Object.keys(salas).map(function (k) { return k.toLowerCase() + ' (' + salas[k].join(', ') + ')'; }).join(', ') || '—') + '<br>' +
      (aloj() ? '<b>Habitaciones:</b> ' + (hab.join(', ') || '—') + '<br>' : '') +
      '<b>Alergias:</b> ' + (al.length ? al.map(function (a, i) { return letra(i) + ': ' + a.alergenos.concat(a.otras ? [a.otras] : []).join(', '); }).join(' · ') : 'ninguna') + '<br>' +
      '</div>' + htmlPresupuesto() +
      // 2.1.0: sin casillas; solo la información básica de protección de datos y un enlace a la completa
      '<div class="card"><div class="card-tit">Protección de datos</div>' +
      '<div class="hint" style="margin-bottom:4px">' + esc(TX.basico || 'Los datos se usan solo para gestionar su estancia en la Casa.') + '</div>' +
      leerMas('Leer la información completa', TX.datos) +
      (TX.autorizacion ? '<div class="hint" style="margin-top:6px">' + esc(TX.autorizacion) + '</div>' : '') + '</div>' +
      '<div class="hint" style="text-align:center">Al enviar, la Casa recibe los datos y le enviará el presupuesto y las condiciones para aceptarlos.</div>';
  }

  // ---------------- Leer lo escrito ----------------
  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : null; }
  function leer() {
    if (paso === 1) {
      F.contacto.responsable = val('cResp'); F.contacto.telefono = val('cTel'); F.contacto.email = val('cEmail');
      F.grupo = { entidad: val('gEnt'), cif: val('gCif'), direccion: val('gDir'), representante: val('gRep'), dni: val('gDni'), cargo: val('gCar') };
    }
    if (paso === 2) {
      $$('[data-sv]').forEach(function (e) { F.servMap[e.dataset.sv] = num(e.value); });
      $$('[data-sala]').forEach(function (e) { F.salaSet[e.dataset.sala] = e.checked; });
      $$('[data-otras]').forEach(function (e) { F.alergias[+e.dataset.otras].otras = e.value.trim(); });
    }
    if (paso === 3 && $('#hObs')) F.habitaciones.observaciones = $('#hObs').value.trim();
  }

  function enlazar() {
    ['cResp', 'cTel', 'cEmail'].forEach(function (id) {
      var el = $('#' + id), av = $('#av_' + id);
      if (el && av) el.oninput = function () { av.hidden = !!el.value.trim(); };
    });
    $$('[data-st]').forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.st, d = +b.dataset.d;
        if (k === 'adultos' || k === 'ninos' || k === 'bebes') {
          leer();
          var antes = totalPersonas();
          F.personas[k] = num(F.personas[k] + d);
          rellenarServicios(antes);
          return pintar();
        }
        if (k === 'nAler') {
          leer();
          if (d > 0) F.alergias.push({ alergenos: [], otras: '' });
          else if (F.alergias.length > 1) F.alergias.pop();
          return pintar();
        }
        F.habitaciones[k] = num(F.habitaciones[k] + d);
        $('#o_' + k).textContent = F.habitaciones[k];
        $('#reparto').innerHTML = htmlReparto();
      };
    });
    $$('[data-al]').forEach(function (b) {
      b.onclick = function () {
        leer();
        F.hayAlergias = b.dataset.al === 'si';
        if (F.hayAlergias && !F.alergias.length) F.alergias.push({ alergenos: [], otras: '' });
        pintar();
      };
    });
    $$('[data-aler]').forEach(function (e) {
      e.onchange = function () {
        var a = F.alergias[+e.dataset.aler], x = e.value, i = a.alergenos.indexOf(x);
        if (e.checked && i < 0) a.alergenos.push(x); if (!e.checked && i >= 0) a.alergenos.splice(i, 1);
        e.parentNode.classList.toggle('on', e.checked);
        var n = e.closest('.per').querySelector('.per-cab .hint'); n.textContent = a.alergenos.length ? a.alergenos.length + ' marcada' + (a.alergenos.length === 1 ? '' : 's') : '';
      };
    });
  }

  // ---------------- Enviar ----------------
  function enviar() {
    var cs = { informado: true };
    var pos = serviciosPosibles(), servicios = [], salas = [];
    Object.keys(F.servMap).forEach(function (k) { if (!pos[k]) return; var x = k.split('|'); if (F.servMap[k]) servicios.push({ fecha: x[0], servicio: x[1], total: F.servMap[k] }); });
    Object.keys(F.salaSet).forEach(function (k) { if (F.salaSet[k]) { var x = k.split('|'); salas.push({ fecha: x[0], sala: x[1] }); } });
    var datos = { contacto: F.contacto, grupo: F.grupo, personas: F.personas, servicios: servicios, salas: salas,
      habitaciones: aloj() ? F.habitaciones : {}, alergias: F.hayAlergias ? F.alergias : [], consentimientos: cs };
    var b = $('#bSig'); b.disabled = true; b.textContent = 'Enviando…';
    DB.enviarFormulario(TOKEN, datos).then(function () {
      $('#fgBarra').hidden = true; pie.hidden = true; pie.innerHTML = ''; $('#fgPaso').textContent = '';
      document.body.classList.add('fg-final');
      $('#fgToast').hidden = true;
      vista.innerHTML = '<div class="fin"><div class="ic" aria-hidden="true">✓</div><h2>¡Gracias! Formulario enviado</h2>' +
        '<p class="hint">La Casa ha recibido sus datos. Le enviaremos el presupuesto y las condiciones para aceptarlos.</p>' +
        '<p class="hint">Si necesita corregir algo, puede volver a abrir este mismo enlace hasta el día de entrada.</p>' +
        '<button type="button" class="b-pri b-fin" id="bTerminar">Terminar</button></div>';
      $('#bTerminar').onclick = function () {
        $('#fgGrupo').textContent = '';
        vista.innerHTML = '<div class="fin adios"><h2>Gracias, le esperamos pronto.</h2></div>';
        window.scrollTo(0, 0);
      };
      window.scrollTo(0, 0);
    }).catch(function (e) {
      b.disabled = false; b.textContent = 'Enviar a la Casa';
      toast(e.message || 'No se pudo enviar. Inténtelo de nuevo.', true);
    });
  }
})();
