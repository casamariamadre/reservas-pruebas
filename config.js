/*
 * CONFIGURACIÓN DE LA APP – solo hay que tocar este archivo.
 *
 * API_URL: la dirección que da Apps Script al implementar (termina en /exec).
 *          Si se deja vacía, la app funciona en MODO DEMOSTRACIÓN
 *          (datos ficticios guardados solo en el propio móvil; clave: demo).
 * GESTORES: nombres que aparecen en "¿Quién eres?". Se pueden cambiar cuando queráis.
 */
/* ENTORNO DE PRUEBAS: conectado SOLO al puente de pruebas. No usar la dirección real. */
window.CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbx-orTAQorIm-XT_Zg2-NMieXLaCYsaSM1eyoZ-wymEFrTEJlSzFWansV7XO3poX_yk/exec',
  NOMBRE_CASA: 'Casa María Madre (PRUEBAS)',
  SUBTITULO: 'Guadalajara',
  GESTORES: ['Viviane', 'Rafael', 'Gema', 'Carlos'],
  CAPACIDAD_PREVISTA: 60
};
