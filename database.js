/**
 * Casa María Madre – CAPA DE DATOS DE LA APP (database.js)
 * ---------------------------------------------------------------
 * ÚNICO archivo de la app que sabe dónde están los datos (hoy: Google Sheets,
 * a través del puente de Google Apps Script cuya dirección está en config.js).
 * El resto de la app solo usa estas funciones. Todas son async y devuelven
 * objetos limpios.
 *
 * Para cambiar a otra base de datos: reescribir este archivo con las mismas funciones.
 *
 * Funciones:
 *   DB.conectar({ gestor, clave })        → recuerda quién trabaja
 *   DB.cargarTodo()                       → { reservas, habitaciones, config, ajustes, esAdmin }
 *   DB.guardarReserva(reserva, asignaciones) → { id, solapes, estado }
 *   DB.cancelarReserva(id)                → { id, estado }
 *   DB.borrarReserva(id)                  → { id, estado }
 *   DB.guardarServicios(id, servicios, datosGrupo) → { id, lineas, estado }
 *   DB.guardarAjustes(valores)            → { cambios, estado }
 *   DB.probarAviso()                      → { para, via, avisosProgramados, estado? }
 *   DB.regenerarCalendario()              → { eventos, estado }
 *   DB.importarCalendario()               → { importadas, omitidas, estado }
 * «estado» es lo mismo que devuelve cargarTodo(), ya actualizado tras el cambio.
 *
 * Errores: se lanza un Error con mensaje en español; err.codigo === 'CLAVE' si la clave
 * no vale y err.red === true si no hay conexión.
 */
(function () {
  'use strict';
  var URL_DATOS = (window.CONFIG || {}).API_URL || '';
  var sesion = { gestor: '', clave: '' };

  function llamar(accion, datos) {
    if (!URL_DATOS) return Promise.reject(new Error('Falta la dirección de los datos (API_URL en config.js).'));
    var pet = { clave: sesion.clave, gestor: sesion.gestor, accion: accion, datos: datos || {} };
    return fetch(URL_DATOS, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(pet), redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('El servidor respondió ' + r.status); return r.json(); })
      .catch(function (e) {
        if (e instanceof TypeError) {
          var x = new Error(navigator.onLine === false ? 'Sin conexión. Revisa la cobertura e inténtalo de nuevo.'
            : 'No se pudo conectar con Google. Revisa que API_URL termine en /exec y que el script esté implementado para «Cualquier usuario».');
          x.red = true; throw x;
        }
        if (e instanceof SyntaxError) throw new Error('Google no devolvió datos válidos. Revisa la implementación del script.');
        throw e;
      })
      .then(function (r) {
        if (!r || !r.ok) { var err = new Error((r && r.error) || 'Error desconocido'); err.codigo = r && r.codigo; throw err; }
        return r.datos || {};
      });
  }

  window.DB = {
    conectar: function (s) { sesion.gestor = String((s && s.gestor) || ''); sesion.clave = String((s && s.clave) || ''); },
    cargarTodo: async function () { return llamar('inicial'); },
    guardarReserva: async function (reserva, asignaciones) { return llamar('guardarReserva', { reserva: reserva, asignaciones: asignaciones || [] }); },
    cancelarReserva: async function (id) { return llamar('cancelarReserva', { id: id }); },
    borrarReserva: async function (id) { return llamar('borrarReserva', { id: id }); },
    guardarServicios: async function (id, servicios, datosGrupo) { return llamar('guardarServicios', { id: id, servicios: servicios || [], grupoDatos: datosGrupo || {} }); },
    guardarAjustes: async function (valores) { return llamar('guardarAjustes', { valores: valores || {} }); },
    probarAviso: async function () { return llamar('probarAviso'); },
    regenerarCalendario: async function () { return llamar('regenerarCalendario'); },
    importarCalendario: async function () { return llamar('importarCalendario'); }
  };
})();
