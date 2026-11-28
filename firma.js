/* Presupuesto y condiciones · Casa María Madre (2.5.3)
   Página pública: se abre con el enlace propio de cada reserva (firma.html#<enlace>).
   El responsable del grupo ve el presupuesto y las condiciones, revisa sus datos,
   marca una sola casilla obligatoria, firma con el dedo y puede adjuntar el comprobante de la fianza.
   No usa ninguna clave de gestor: todo va con ese enlace, a través de database.js. */
(function () {
  'use strict';
  var TOKEN = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  var $ = function (s) { return document.querySelector(s); };
  var vista = $('#fgVista'), pie = $('#fgPie');
  var INFO = null, trazos = [], ED = null, avisoVisto = false;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function legible(t) { var p = String(t).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function marca(t) { return t ? legible(t) + (String(t).length > 10 ? ' a las ' + String(t).slice(11, 16) : '') : ''; }
  function toast(m, error) { var t = $('#fgToast'); t.textContent = m; t.className = 'fg-toast' + (error ? ' error' : ''); t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 3500); }

  if (!TOKEN) return mensaje('Falta el enlace', 'Abra el presupuesto desde el enlace que le envió la Casa.');
  DB.leerFirma(TOKEN).then(function (d) {
    INFO = d;
    if (!d.abierto) return mensaje('Enlace no disponible', d.motivo || 'Para cualquier cosa, contacte con la Casa.', d.casa);
    $('#fgGrupo').textContent = d.reserva.grupo + ' · ' + legible(d.reserva.entrada) + ' a ' + legible(d.reserva.salida);
    if (d.firmado) return yaFirmado();
    // 2.5.3: si el grupo aún no envió el formulario, puede poner sus personas y quitar comidas
    if (d.editable) ED = { pax: Object.assign({ adultos: 0, ninos: 0, bebes: 0 }, d.editable.pax), quitadas: {} };
    if (ED) (d.editable.quitadas || []).forEach(function (k) { ED.quitadas[k] = true; });
    pintar();
  }).catch(function (e) {
    mensaje(e.codigo === 'ENLACE' ? 'Enlace no válido' : 'No se pudo abrir', e.message || 'Inténtelo de nuevo más tarde.');
  });

  function mensaje(tit, txt, casa) {
    pie.hidden = true;
    vista.innerHTML = '<div class="card fin"><h2>' + esc(tit) + '</h2><p class="hint">' + esc(txt) + '</p>' +
      (casa && casa.telefono ? '<p class="hint">Teléfono de la Casa: <a href="tel:' + esc(casa.telefono.replace(/\s/g, '')) + '">' + esc(casa.telefono) + '</a></p>' : '') + '</div>';
  }

  // ---------------- El documento ----------------
  function eur(n) { n = Math.round((Number(n) || 0) * 100) / 100; return n.toLocaleString('es-ES', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2, useGrouping: 'always' }) + ' €'; }
  function htmlDoc(doc, datos, firma, imagenes, comunicaciones) {
    var c = doc.consentimiento || {};
    var cuerpo = (doc.bloques || []).map(function (b) {
      var x = esc(b.x).replace(/\{(representante|dni|cargo|domicilio|cif_cliente|entidad)\}/g, function (m, k) {
        var v = datos[k]; return '<span class="hueco" data-h="' + k + '">' + (v ? esc(v) : '________') + '</span>';
      });
      return b.t === 'h' ? '<h3 class="ct-h">' + x + '</h3>' : b.t === 'c' ? '<h4 class="ct-c">' + x + '</h4>' : b.t === 'd' ? '<p class="ct-d">' + x + '</p>' : '<p>' + x + '</p>';
    }).join('');
    var casa = INFO.casa || {};
    var pre = doc.presupuesto ? '<h3 class="ct-h">PRESUPUESTO</h3><div class="ct-pre">' + htmlResumen(doc.presupuesto, true) + '</div>' : '';  // 2.5.3: un solo PDF
    return '<div class="contrato-doc">' + pre + cuerpo +
      '<h3 class="ct-h">INFORMACIÓN COMPLETA SOBRE PROTECCIÓN DE DATOS</h3>' + String(c.datos || '').split(/\n+/).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
      (c.imagenes ? '<p><b>' + (imagenes ? '☑' : '☐') + '</b> ' + esc(c.imagenes) + '</p>' : '') +
      (c.comunicaciones ? '<p><b>' + (comunicaciones ? '☑' : '☐') + '</b> ' + esc(c.comunicaciones) + '</p>' : '') +
      (c.autorizacion ? '<p><b>Declaración:</b> ' + esc(c.autorizacion) + '</p>' : '') +
      (firma ? '<div class="ct-firmas"><div><small>Por el prestador del servicio</small><div class="ct-firma vacia"></div><b>' + esc(casa.firmante || '') + '</b><br>' + esc(casa.cargo || '') + '</div>' +
        '<div><small>Por el cliente</small>' + svgFirma(firma) + '<b>' + esc(datos.representante) + '</b>' + (datos.dni || datos.cargo ? '<br>' + [datos.dni ? 'DNI ' + esc(datos.dni) : '', esc(datos.cargo || '')].filter(Boolean).join(' · ') : '') +
        (datos.firmadoEl ? '<br><small>Firmado electrónicamente el ' + esc(marca(datos.firmadoEl)) + '</small>' : '') + '</div></div>' : '') +
      '</div>';
  }
  function svgFirma(d) { return '<svg class="ct-firma" viewBox="0 0 600 200" preserveAspectRatio="xMidYMid meet"><path d="' + esc(d) + '" fill="none" stroke="#123" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }

  // ---------------- Presupuesto (2.5.3: resumido, con total por persona) ----------------
  var DSEM = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  function corto(t) { var p = t.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]); return DSEM[d.getDay()] + ' ' + d.getDate(); }
  function pl(n, s, p) { return n + ' ' + (n === 1 ? s : p); }
  function totalPax(p) { return p ? (p.adultos || 0) + (p.ninos || 0) + (p.bebes || 0) : 0; }
  /** Mismo cálculo que la Casa (resumenPresupuesto_): una línea por servicio y total por persona entre los que pagan. */
  function resumenLocal() {
    var e = INFO.editable, pr = e.precios || {}, pax = ED.pax, lista = [];
    if (totalPax(pax)) e.huecos.forEach(function (h) { if (h.servicio !== 'Noche' && ED.quitadas[h.fecha + '|' + h.servicio]) return; lista.push({ servicio: h.servicio, adultos: pax.adultos, ninos: pax.ninos }); });
    function precio(k) { var v = String(pr[k] == null ? '' : pr[k]).replace(',', '.').trim(); return v === '' || isNaN(+v) ? null : +v; }
    function r2(n) { return Math.round(n * 100) / 100; }
    var lineas = [], total = 0, consultar = false;
    [['Desayuno', 'desayuno', 'Desayunos'], ['Comida', 'comida', 'Comidas'], ['Cena', 'cena', 'Cenas'], ['Noche', 'noche', 'Alojamiento']].forEach(function (c) {
      var pa = precio('precio.adulto.' + c[1]), pn = precio('precio.nino.' + c[1]), imp = 0, hay = false;
      lista.forEach(function (x) { if (x.servicio !== c[0]) return; hay = true; if ((x.adultos && pa == null) || (x.ninos && pn == null)) consultar = true; imp += x.adultos * (pa || 0) + x.ninos * (pn || 0); });
      if (hay) { lineas.push({ txt: c[2], imp: r2(imp) }); total += imp; }
    });
    [['Salón', 'salon'], ['Salas', 'salas'], ['Capilla', 'capilla'], ['Garaje', 'garaje']].forEach(function (c) {
      var dias = (e.fijas || []).filter(function (x) { return x.servicio === c[0]; }).length; if (!dias) return;
      var p = precio('precio.' + c[1]), txt = c[0] + ' (' + dias + (dias === 1 ? ' día' : ' días') + ')';
      if (p == null) { consultar = true; lineas.push({ txt: txt, imp: null }); } else { lineas.push({ txt: txt, imp: r2(dias * p) }); total += dias * p; }
    });
    function paga(edad) { return ['desayuno', 'comida', 'cena', 'noche'].some(function (k) { return (precio('precio.' + edad + '.' + k) || 0) > 0; }); }
    var pagantes = (paga('adulto') ? pax.adultos : 0) + (paga('nino') ? pax.ninos : 0);
    total = r2(total);
    return { personas: { adultos: pax.adultos, ninos: pax.ninos, bebes: pax.bebes }, total: total, lineas: lineas, pagantes: pagantes,
      porPersona: pagantes ? r2(total / pagantes) : 0, consultar: consultar, gratisHasta: pr['edad.gratis_hasta'] || 4 };
  }
  function resumenActual() { return ED ? resumenLocal() : INFO.resumen; }
  var SIN_PAX = 'Sin número de personas no se puede hacer el presupuesto. Se actualizará al confirmar los detalles, un mes antes de la llegada.';
  /** Las líneas del presupuesto (también para el PDF). */
  function htmlResumen(R, enDoc) {
    var p = R && R.personas;
    if (!R || !totalPax(p)) return '<p class="hint" style="margin:0">' + SIN_PAX + '</p>';
    return '<div class="pre-pers"><b>' + pl(totalPax(p), 'persona', 'personas') + '</b> · ' + pl(p.adultos, 'adulto', 'adultos') + ' · ' + pl(p.ninos, 'niño', 'niños') + ' · ' + pl(p.bebes, 'bebé', 'bebés') + '</div>' +
      (R.lineas || []).map(function (l) { return '<div class="pre-fila"><span>' + esc(l.txt) + '</span><b>' + (l.imp == null ? 'a consultar' : eur(l.imp)) + '</b></div>'; }).join('') +
      '<div class="pre-fila pre-total"><span><b>Total previsto</b></span><b>' + eur(R.total) + '</b></div>' +
      '<div class="pre-fila"><span>Total por persona' + (R.pagantes !== totalPax(p) ? ' <span class="hint">(entre ' + R.pagantes + ' que pagan)</span>' : '') + '</span><b>' + (R.pagantes ? eur(R.porPersona) : '—') + '</b></div>' +
      '<div class="hint" style="margin:4px 0 6px">Es una estimación' + (R.consultar ? ' (algún precio, a consultar)' : '') + '. Un mes antes se actualizará este presupuesto.' + (p.bebes ? ' Los bebés (0 a ' + esc(R.gratisHasta || 4) + ' años) no pagan.' : '') + '</div>';
  }
  function stepper(k, v, tit) {
    var et = tit.replace(/<[^>]+>/g, '').replace(/"/g, '');
    return '<div class="paso-fila"><div class="t">' + tit + '</div><div class="stp"><button type="button" data-px="' + k + '" data-d="-1" aria-label="Quitar uno: ' + et + '">−</button><output>' + v + '</output>' +
      '<button type="button" data-px="' + k + '" data-d="1" aria-label="Añadir uno: ' + et + '">+</button></div></div>';
  }
  function htmlEditar() {
    var e = INFO.editable, pr = e.precios || {}, g = pr['edad.gratis_hasta'] || 4, ad = pr['edad.adulto_desde'] || 9;
    var html = '<div class="pre-edit"><div class="hint" style="margin-bottom:4px">¿Cuántas personas vendrán? Solo el número.</div>' +
      stepper('adultos', ED.pax.adultos, 'Adultos <span class="hint">(desde ' + esc(ad) + ' años)</span>') +
      stepper('ninos', ED.pax.ninos, 'Niños <span class="hint">(' + (+g + 1) + ' a ' + (+ad - 1) + ' años)</span>') +
      stepper('bebes', ED.pax.bebes, 'Bebés <span class="hint">(0 a ' + esc(g) + ' años, gratis)</span>');
    var comidas = e.huecos.filter(function (h) { return h.servicio !== 'Noche'; });
    if (totalPax(ED.pax) && comidas.length) {
      var porDia = {}; comidas.forEach(function (h) { (porDia[h.fecha] = porDia[h.fecha] || []).push(h.servicio); });
      html += '<div class="hint" style="margin:10px 0 4px">Comidas previstas. Toque una para quitarla si no la necesitan.</div>' +
        Object.keys(porDia).sort().map(function (f) {
          return '<div class="chips-dia"><span class="chips-f">' + corto(f) + '</span>' + porDia[f].map(function (sv) {
            var k = f + '|' + sv, off = !!ED.quitadas[k];
            return '<button type="button" class="chip' + (off ? ' off' : '') + '" data-cm="' + k + '" aria-pressed="' + !off + '">' + (off ? '' : '✓ ') + sv + '</button>';
          }).join('') + '</div>';
        }).join('');
    }
    return html + '</div>';
  }
  function presupuesto() {
    var p = INFO.presupuesto || {}, casa = INFO.casa || {}, R = resumenActual();
    var fianza = INFO.sinFianza || !p.senal ? '' : '<div class="pre-fila"><span>Fianza, al aceptar</span><b>' + eur(p.senal) + '</b></div>';
    return '<div class="card" id="cPre"><div class="card-tit pri">Presupuesto' + (p.actualizadoEl ? ' <span class="hint" style="font-weight:400">· Actualizado el ' + esc(legible(p.actualizadoEl)) + '</span>' : '') + '</div>' +
      (ED ? htmlEditar() : '') + htmlResumen(R) + fianza +
      '<div class="hint" style="margin-top:6px">El importe se ajusta en la liquidación a los servicios realmente prestados; se paga ' + (p.diasPago ? 'en los ' + esc(p.diasPago) + ' días siguientes a la salida' : 'después de la salida') + '.' + (INFO.sinFianza || !p.senal ? '' : ' La fianza se descuenta en la liquidación o se devuelve después.') + (casa.iban ? ' Cuenta: ' + esc(casa.iban) + '.' : '') + '</div></div>';
  }
  function repintarPresupuesto() {
    var c = $('#cPre'); if (!c) return;
    c.outerHTML = presupuesto(); enlazarPresupuesto();
  }
  function avisoEstimacion() {
    if (avisoVisto) return; avisoVisto = true;
    var m = document.createElement('div'); m.className = 'fg-modal';
    m.innerHTML = '<div class="fg-modal-caja"><p><b>Es una estimación.</b></p><p>Un mes antes se actualizará este presupuesto.</p><button type="button" class="b-pri">Entendido</button></div>';
    document.body.appendChild(m);
    m.querySelector('button').onclick = function () { m.remove(); };
  }
  function enlazarPresupuesto() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-px]'), function (b) {
      b.onclick = function () { var k = b.dataset.px; ED.tocado = true; ED.pax[k] = Math.max(0, Math.min(999, (ED.pax[k] || 0) + (+b.dataset.d))); repintarPresupuesto(); avisoEstimacion(); };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-cm]'), function (b) {
      b.onclick = function () { var k = b.dataset.cm; ED.tocado = true; if (ED.quitadas[k]) delete ED.quitadas[k]; else ED.quitadas[k] = true; repintarPresupuesto(); };
    });
  }

  function bloqueSenal() {
    if (INFO.sinFianza) return '';  // 2.5.0: este grupo no paga fianza
    var s = INFO.senal || {}, p = INFO.presupuesto || {}, casa = INFO.casa || {}, r = INFO.reserva || {};
    var imp = s.importe != null ? s.importe : p.senal;
    if (!imp && !s.pagada && !s.comprobanteEl) return '';
    var concepto = 'Fianza – ' + (r.grupo || '') + ' – ' + (r.entrada ? legible(r.entrada) : '');
    if (s.pagada) {
      return '<div class="card senal-box ok"><div class="card-tit">Pago de la fianza</div>' +
        '<p class="senal-msg ok">✓ Fianza recibida. Su reserva está confirmada.</p></div>';
    }
    var datosPago =
      (imp ? '<div class="pre-fila"><span>Importe de la fianza</span><b>' + eur(imp) + '</b></div>' : '') +
      (casa.iban ? '<div class="pre-fila"><span>Cuenta (IBAN)</span><b>' + esc(casa.iban) + '</b></div>' : '') +
      '<div class="pre-fila"><span>Concepto</span><b>' + esc(concepto) + '</b></div>' +
      '<div class="pre-fila"><span>Plazo</span><b>En los 7 días siguientes a la aceptación</b></div>';
    var input = '<input type="file" id="fComp" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" hidden>';
    if (s.comprobanteEl) {
      return '<div class="card senal-box" id="boxSenal"><div class="card-tit pri">Pago de la fianza</div>' + datosPago +
        '<div class="senal-est" id="sCompMsg"><p class="senal-msg ok">✓ Comprobante recibido el ' + esc(marca(s.comprobanteEl)) + '.</p>' +
        '<div class="senal-btns"><button type="button" class="b-sec" id="bAdjuntar">Sustituir comprobante</button></div>' +
        '<div class="hint" style="margin-top:6px">PDF, JPG o PNG (máximo 5 MB).</div></div>' + input + '</div>';
    }
    return '<div class="card senal-box" id="boxSenal"><div class="card-tit pri">Pago de la fianza</div>' + datosPago +
      '<div class="senal-est" id="sCompMsg">' +
        '<p class="senal-preg">¿Adjuntar ahora el comprobante de la fianza?</p>' +
        '<div class="senal-btns">' +
          '<button type="button" class="b-pri" id="bAdjuntar">Adjuntar comprobante</button>' +
          '<button type="button" class="b-sec" id="bMasTarde">Lo adjuntaré más tarde</button>' +
        '</div>' +
        '<div class="hint" style="margin-top:6px">Solo PDF, JPG o PNG, de hasta 5 MB.</div>' +
      '</div>' + input + '</div>';
  }

  function enlazarSenal() {
    var inp = $('#fComp'), bAdj = $('#bAdjuntar'), bMas = $('#bMasTarde'), msg = $('#sCompMsg');
    if (!inp) return;
    if (bAdj) bAdj.onclick = function () { inp.value = ''; inp.click(); };
    if (bMas) bMas.onclick = function () {
      msg.innerHTML = '<p class="senal-msg">De acuerdo. Puede volver a este mismo enlace cuando quiera para adjuntarlo. Si pasan 7 días sin recibirlo, la Casa se lo recordará.</p>' +
        '<div class="senal-btns"><button type="button" class="b-sec" id="bAdjuntar">Adjuntar comprobante</button></div>';
      enlazarSenal();
    };
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var ext = (f.name.split('.').pop() || '').toLowerCase();
      var mime = (f.type || '').toLowerCase();
      var tipo = (ext === 'pdf' || mime === 'application/pdf') ? 'pdf'
        : (ext === 'jpg' || ext === 'jpeg' || mime === 'image/jpeg') ? 'jpg'
        : (ext === 'png' || mime === 'image/png') ? 'png' : '';
      if (!tipo) return toast('Solo se admiten archivos PDF, JPG o PNG.', true);
      if (f.size > 5 * 1024 * 1024) return toast('El archivo supera el tamaño máximo de 5 MB.', true);
      if (bAdj) { bAdj.disabled = true; bAdj.textContent = 'Subiendo…'; }
      var rd = new FileReader();
      rd.onload = function () {
        var b64 = String(rd.result || '').replace(/^data:[^;]+;base64,/, '');
        DB.adjuntarComprobante(TOKEN, { tipo: tipo, base64: b64 }).then(function (r) {
          INFO.senal = INFO.senal || {};
          INFO.senal.comprobanteEl = r.comprobanteEl;
          msg.innerHTML = '<p class="senal-msg ok">✓ Comprobante recibido. La Casa lo comprobará y confirmará su reserva.</p>' +
            '<div class="senal-btns"><button type="button" class="b-sec" id="bAdjuntar">Sustituir comprobante</button></div>';
          toast('Comprobante recibido');
          enlazarSenal();
        }).catch(function (e) {
          if (bAdj) { bAdj.disabled = false; bAdj.textContent = 'Adjuntar comprobante'; }
          toast(e.message || 'No se pudo enviar el comprobante.', true);
        });
      };
      rd.onerror = function () {
        if (bAdj) { bAdj.disabled = false; bAdj.textContent = 'Adjuntar comprobante'; }
        toast('No se pudo leer el archivo.', true);
      };
      rd.readAsDataURL(f);
    };
  }

  // ---------------- Firmar ----------------
  function pintar() {
    var p = INFO.prefill || {}, c = (INFO.documento || {}).consentimiento || {};
    var nomInicial = p.representante || p.responsable || '';
    var completos = nomInicial.trim().length >= 2 && (p.telefono || '').trim() && (p.email || '').trim();
    vista.innerHTML =
      '<div><h2>Presupuesto y condiciones</h2><div class="hint">Revíselos. Después marque la casilla y firme con el dedo.</div></div>' +
      presupuesto() +
      '<div class="zona-firma">' +
        '<div class="zf-tit">✍ Rellene y firme aquí</div>' +
        '<details class="zf-paso" id="dDatos" open>'  /* 2.5.1: datos siempre a la vista */ +
          '<summary><span class="zf-sum-izq" id="sDatos"></span><span class="zf-sum-der">Revisar o corregir ›</span></summary>' +
          '<div class="zf-cuerpo">' +
            '<label class="f" for="fNom">Nombre y apellidos de quien firma * <span class="falta-av" id="avNom" hidden>Falta</span></label><input id="fNom" type="text" autocomplete="name" value="' + esc(nomInicial) + '">' +
            '<label class="f" for="fTel">Teléfono * <span class="falta-av" id="avTel" hidden>Falta</span></label><input id="fTel" type="tel" inputmode="tel" autocomplete="tel" value="' + esc(p.telefono) + '">' +
            '<label class="f" for="fMail">Correo electrónico * <span class="falta-av" id="avMail" hidden>Falta</span></label><input id="fMail" type="email" inputmode="email" autocomplete="email" value="' + esc(p.email) + '">' +
            '<label class="f" for="fDni">DNI (opcional)</label><input id="fDni" type="text" autocomplete="off" value="' + esc(p.dni) + '">' +
            '<label class="f" for="fCar">En calidad de / cargo (opcional)</label><input id="fCar" type="text" autocomplete="off" placeholder="Por ejemplo: presidente, responsable del grupo" value="' + esc(p.cargo) + '">' +
            '<label class="f" for="fEnt">Entidad (opcional)</label><input id="fEnt" type="text" autocomplete="organization" value="' + esc(p.entidad) + '">' +
            '<label class="f" for="fCif">CIF de la entidad (opcional)</label><input id="fCif" type="text" autocomplete="off" value="' + esc(p.cif) + '">' +
            '<label class="f" for="fDom">Domicilio social de la entidad (opcional)</label><input id="fDom" type="text" autocomplete="street-address" placeholder="Calle, número, código postal y localidad" value="' + esc(p.domicilio) + '">' +
          '</div>' +
        '</details>' +
        '<div class="zf-paso zf-casillas">' +
          '<label class="chk"><input type="checkbox" id="kAcepto"><span>② He leído y acepto el presupuesto y <a href="#doc" id="aCond">las condiciones</a> de la reserva. <b>(obligatorio)</b></span></label>' +
          (c.imagenes ? '<label class="chk chk-opc"><input type="checkbox" id="kImg"><span>' + esc(c.imagenes) + ' (opcional)</span></label>' : '') +
          (c.comunicaciones ? '<label class="chk chk-opc"><input type="checkbox" id="kCom"><span>' + esc(c.comunicaciones) + ' (opcional)</span></label>' : '') +
        '</div>' +
        '<details class="zf-paso" id="dFirma">' +
          '<summary><span class="zf-firma-sum" id="sFirma">③ ✍ Pulse aquí para firmar</span></summary>' +
          '<div class="zf-cuerpo">' +
            '<div class="zf-firma-bar"><span class="hint">Firme con el dedo dentro del recuadro.</span><button type="button" class="b-link" id="bBorrar">Borrar firma</button></div>' +
            '<canvas id="pad" class="pad" aria-label="Recuadro para firmar"></canvas>' +
          '</div>' +
        '</details>' +
      '</div>' +
      '<details class="card cond-plegable" id="doc" style="padding:0">' +
        '<summary><span>📄 Condiciones de la reserva (leer)</span><span>›</span></summary>' +
        htmlDoc(INFO.documento, { representante: nomInicial, dni: p.dni, cargo: p.cargo, domicilio: p.domicilio, cif_cliente: p.cif, entidad: p.entidad }, null, false, false) +
      '</details>';
    pie.hidden = false;
    pie.innerHTML = '<button type="button" class="b-pri" id="bFirmar">Aceptar y firmar</button>';
    ['fNom', 'fTel', 'fMail', 'fDni', 'fCar', 'fEnt', 'fDom', 'fCif'].forEach(function (id) { if ($('#' + id)) $('#' + id).oninput = actualizarHuecos; });
    $('#aCond').onclick = function (e) { e.preventDefault(); e.stopPropagation(); var d = $('#doc'); d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    $('#kAcepto').onchange = function () { if (this.checked && !$('#dFirma').open) $('#dFirma').open = true; };
    actualizarHuecos();
    if (ED) enlazarPresupuesto();
    prepararPad();
    $('#bBorrar').onclick = function () { trazos = []; dibujar(); actualizarResumenFirma(); };
    $('#bFirmar').onclick = enviar;
  }
  function actualizarHuecos() {
    var nom = $('#fNom').value.trim(), tel = $('#fTel') ? $('#fTel').value.trim() : '', mail = $('#fMail') ? $('#fMail').value.trim() : '';
    var ent = $('#fEnt') ? $('#fEnt').value.trim() : ((INFO.prefill && INFO.prefill.entidad) || '');
    var v = { representante: nom, dni: $('#fDni').value.trim(), cargo: $('#fCar').value.trim(), domicilio: $('#fDom').value.trim(), cif_cliente: $('#fCif').value.trim(), entidad: ent || (INFO.reserva ? INFO.reserva.grupo : '') };
    Array.prototype.forEach.call(document.querySelectorAll('.hueco'), function (h) { h.textContent = v[h.dataset.h] || '________'; });
    if ($('#avNom')) $('#avNom').hidden = nom.length >= 2;
    if ($('#avTel')) $('#avTel').hidden = !!tel;
    if ($('#avMail')) $('#avMail').hidden = !!mail;
    var s = $('#sDatos');
    if (s) {
      var ok = nom.length >= 2;
      var sub = v.domicilio || tel || mail || '';
      s.textContent = ok ? '① ' + nom + (sub ? ' · ' + sub : '') : '① Sus datos · Falta completar';
      s.className = 'zf-sum-izq' + (ok ? '' : ' falta');
    }
  }
  function hayFirma() { return trazos.reduce(function (n, t) { return n + t.length; }, 0) >= 8; }
  function actualizarResumenFirma() {
    var s = $('#sFirma'); if (!s) return;
    var ok = hayFirma();
    s.textContent = ok ? '③ ✓ Firmado · Volver a firmar' : '③ ✍ Pulse aquí para firmar';
    s.className = 'zf-firma-sum' + (ok ? ' ok' : '');
  }

  // Recuadro de firma: guarda los trazos en coordenadas de 600 × 200 y los pinta.
  var pad, ctx;
  function prepararPad() {
    pad = $('#pad'); ctx = pad.getContext('2d');
    function medir() {
      var r = pad.getBoundingClientRect(), k = window.devicePixelRatio || 1;
      if (!r.width || !r.height) return;
      pad.width = r.width * k; pad.height = r.height * k; dibujar();
    }
    medir(); window.addEventListener('resize', medir);
    $('#dFirma').addEventListener('toggle', function () { if (this.open) medir(); });
    var actual = null;
    function limitar(v, max) { return Math.max(0, Math.min(max, Math.round(v))); }
    function punto(e) { var r = pad.getBoundingClientRect(); return [limitar((e.clientX - r.left) / r.width * 600, 600), limitar((e.clientY - r.top) / r.height * 200, 200)]; }
    pad.addEventListener('pointerdown', function (e) { e.preventDefault(); pad.setPointerCapture(e.pointerId); actual = [punto(e)]; trazos.push(actual); dibujar(); actualizarResumenFirma(); });
    pad.addEventListener('pointermove', function (e) { if (!actual) return; e.preventDefault(); var p = punto(e), u = actual[actual.length - 1]; if (Math.abs(p[0] - u[0]) + Math.abs(p[1] - u[1]) >= 2) { actual.push(p); dibujar(); actualizarResumenFirma(); } });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { pad.addEventListener(ev, function () { actual = null; actualizarResumenFirma(); }); });
  }
  function dibujar() {
    if (!ctx || !pad.width) return;
    var k = pad.width / 600;
    ctx.clearRect(0, 0, pad.width, pad.height);
    ctx.lineWidth = 3 * k; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#123';
    trazos.forEach(function (t) {
      ctx.beginPath(); ctx.moveTo(t[0][0] * k, t[0][1] * k);
      if (t.length === 1) ctx.lineTo(t[0][0] * k + 0.5, t[0][1] * k + 0.5);
      t.forEach(function (p, i) { if (i) ctx.lineTo(p[0] * k, p[1] * k); });
      ctx.stroke();
    });
  }
  function rutaFirma() {
    function textoRuta(lista) {
      return lista.map(function (t) {
        var pts = t.length === 1 ? [t[0], [t[0][0] < 600 ? t[0][0] + 1 : 599, t[0][1] < 200 ? t[0][1] + 1 : 199]] : t;
        return pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ' ' + p[1]; }).join(' ');
      }).join(' ');
    }
    var lista = trazos, s = textoRuta(lista);
    while (s.length > 36000 && lista.some(function (t) { return t.length > 2; })) {
      lista = lista.map(function (t) {
        return t.length <= 2 ? t : t.filter(function (p, i) { return i === 0 || i === t.length - 1 || i % 2 === 0; });
      });
      s = textoRuta(lista);
    }
    return s;
  }

  function enviar() {
    var nom = $('#fNom').value.trim(), dni = $('#fDni').value.trim(), car = $('#fCar').value.trim();
    var dom = $('#fDom').value.trim(), cif = $('#fCif').value.trim();
    var tel = $('#fTel') ? $('#fTel').value.trim() : '', mail = $('#fMail') ? $('#fMail').value.trim() : '';
    var ent = $('#fEnt') ? $('#fEnt').value.trim() : '';
    if (nom.length < 2) { $('#dDatos').open = true; $('#fNom').focus(); return toast('Escriba su nombre para firmar.', true); }
    if (!$('#kAcepto').checked) return toast('Marque la casilla obligatoria para poder firmar.', true);
    if (!hayFirma()) { $('#dFirma').open = true; $('#dFirma').scrollIntoView({ behavior: 'smooth', block: 'center' }); return toast('Firme con el dedo dentro del recuadro.', true); }
    var firma = rutaFirma(), img = !!($('#kImg') && $('#kImg').checked), com = !!($('#kCom') && $('#kCom').checked);
    if (firma.length < 20 || firma.length > 40000 || !/^[ML0-9 .]+$/.test(firma)) { $('#dFirma').open = true; $('#dFirma').scrollIntoView({ behavior: 'smooth', block: 'center' }); return toast('Dibuje su firma en el recuadro.', true); }
    var b = $('#bFirmar'); b.disabled = true; b.textContent = 'Firmando…';
    var datos = { nombre: nom, telefono: tel, email: mail, entidad: ent, dni: dni, cargo: car, domicilio: dom, cif: cif, acepto: true, imagenes: img, comunicaciones: com, firma: firma };
    var R = resumenActual();
    if (ED && ED.tocado) { datos.pax = ED.pax; datos.quitadas = Object.keys(ED.quitadas); }
    DB.enviarFirma(TOKEN, datos).then(function (r) {
      INFO.resumen = R; ED = null;  // 2.5.3: queda el presupuesto aceptado
      INFO.documento.presupuesto = totalPax(R && R.personas) ? R : null;
      INFO.firmado = { firmadoEl: r.recibido || r.firmadoEl, nombre: nom, dni: dni, cargo: car, domicilio: dom, cif: cif, entidad: ent, imagenes: img, comunicaciones: com, firma: firma,
        documento: r.documento || INFO.documento };
      fin();
    }).catch(function (e) {
      b.disabled = false; b.textContent = 'Aceptar y firmar';
      toast(e.message || 'No se pudo firmar. Inténtelo de nuevo.', true);
    });
  }

  // ---------------- Después de firmar ----------------
  function copia() {
    var f = INFO.firmado;
    return htmlDoc(f.documento || INFO.documento, { representante: f.nombre, dni: f.dni, cargo: f.cargo, domicilio: f.domicilio, cif_cliente: f.cif, entidad: f.entidad || (INFO.reserva && INFO.reserva.grupo) || '', firmadoEl: f.firmadoEl }, f.firma, f.imagenes, f.comunicaciones);
  }
  function fin() {
    pie.hidden = true; pie.innerHTML = '';
    document.body.classList.add('fg-final');
    $('#fgToast').hidden = true;
    vista.innerHTML = '<div class="fin"><div class="ic" aria-hidden="true">✓</div><h2>¡Gracias! Condiciones aceptadas</h2>' +
      '<p class="hint">La Casa ha recibido su firma.</p></div>' +
      bloqueSenal() +
      presupuesto() +
      '<div class="fin" style="padding-top:10px">' +
      '<p class="hint">Puede guardar una copia en PDF de las condiciones firmadas.</p>' +
      '<button type="button" class="b-sec b-fin" id="bCopia">Ver / guardar copia (PDF)</button>' +
      '<button type="button" class="b-pri b-fin" id="bTerminar">Terminar</button></div>' +
      '<div class="imprimir-solo">' + copia() + '</div>';
    window.scrollTo(0, 0);
    enlazarSenal();
    $('#bCopia').onclick = imprimir;
    $('#bTerminar').onclick = function () { $('#fgGrupo').textContent = ''; vista.innerHTML = '<div class="fin adios"><h2>Gracias, le esperamos pronto.</h2></div>'; };
  }
  function yaFirmado() {
    var f = INFO.firmado;
    document.body.classList.add('fg-final');
    vista.innerHTML =
      bloqueSenal() +
      presupuesto() +
      '<div class="card fin"><div class="ic" aria-hidden="true">✓</div><h2>Condiciones aceptadas</h2>' +
      '<p class="hint">Aceptadas y firmadas por ' + esc(f.nombre) + ' el ' + esc(marca(f.firmadoEl)) + '.</p>' +
      '<button type="button" class="b-sec b-fin" id="bCopia">Ver / guardar copia (PDF)</button></div>' +
      '<div class="imprimir-solo">' + copia() + '</div>';
    enlazarSenal();
    $('#bCopia').onclick = imprimir;
  }
  function imprimir() { document.title = 'Condiciones · ' + (INFO.reserva ? INFO.reserva.grupo : ''); window.print(); }
})();
