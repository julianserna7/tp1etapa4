// ─────────────────────────────────────────────
//  PARÁMETROS VISUALES
// ─────────────────────────────────────────────
const IMG_BLANCO = "img/blanco1.png";
const IMG_AZUL   = "img/azul1.png";
const IMG_ROJO   = "img/rojo1.png";

const TAMANIO_MIN       = 35;
const TAMANIO_MAX       = 45;
const CANTIDAD_CIRCULOS = 270;
const MARCO             = 25;

// Niveles de brillo (0 a 4 o 40% a 100%)
const NIVELES_BRILLO = [40, 60, 80, 100];

// Duración de las animaciones de transición (ms)
const DURACION_TRANSICION_BRILLO = 400;
const DURACION_TRANSICION_COLOR  = 400;

// ─────────────────────────────────────────────
//  PARÁMETROS DE AUDIO
// ─────────────────────────────────────────────
const AMP_MIN            = 0.0;
const AMP_MAX            = 1.0;
const UMBRAL_VOLUMEN     = 0.25; // Puede variar de acuerdo a la sensibilidad del micrófono y el volumen de la voz

// Rango de frecuencia ajustado a la voz real medida en calibración
// (grave entre 150-200 hz, agudo entre 220-260 hz)
const FREC_MIN           = 150;
const FREC_MAX           = 260;
const UMBRAL_FRECUENCIA  = 0.2; // Puede variar de acuerdo a la sensibilidad del micrófono y el volumen de la voz

const UMBRAL_MANTENIDO   = 800; // Tiempo de espera para subir brillo de los círculos (grave mantenido en ms)
const COOLDOWN           = 1400;

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/ml5js/ml5-data-and-models/models/pitch-detection/crepe/';

// ─────────────────────────────────────────────
//  ESTADO VISUAL
// ─────────────────────────────────────────────
let contadorGrave = 0;
let contadorAgudo = 0;

// Nivel de brillo
let nivelBrillo = 0;
let dirBrillo   = 1;

// Animación de brillo
let brilloAnimado       = NIVELES_BRILLO[0]; // valor actual mostrado en pantalla (0-100)
let brilloDesde         = NIVELES_BRILLO[0];
let brilloHasta         = NIVELES_BRILLO[0];
let tiempoInicioBrillo  = 0;

// Animación de color
let contadorGravePrev = 0;
let contadorAgudoPrev = 0;
let tiempoInicioColor = 0;
let transicionColorActiva = false;

let circulos  = [];
let imgBlanco, imgAzul, imgRojo;

// ─────────────────────────────────────────────
//  ESTADO DE AUDIO
// ─────────────────────────────────────────────
let mic, pitch, audioContext;
let modeloCargado = false;

let gestorAmp;
let gestorPitch;

let sonidoActivo             = false;
let antesHabiaSonido         = false;
let tiempoInicioSonido       = 0;
let volumenPicoSonido        = 0;

let frecMasGrave             = 1; // arranca en 1 (el extremo agudo)
let frecMasAguda             = 0; // arranca en 0 (el extremo grave)
let sonidoMantenidoYaContado = false;

let ultimoGrave     = -COOLDOWN;
let ultimoAgudo     = -COOLDOWN;
let ultimoMantenido = -COOLDOWN;

let modoCalibrar = false;

// Temblor
let intensidadTemblor  = 0;  // valor actual (0 = sin temblor)
let tiempoFinSonido    = 0;  // cuando terminó el sonido, para el fade
const DURACION_TEMBLOR = 400; // ms que tarda en apagarse al terminar el sonido
const FUERZA_TEMBLOR   = 4;  // máximo desplazamiento en píxeles

// ─────────────────────────────────────────────
//  CARGA
// ─────────────────────────────────────────────
function preload() {
  imgBlanco = loadImage(IMG_BLANCO);
  imgAzul   = loadImage(IMG_AZUL);
  imgRojo   = loadImage(IMG_ROJO);
}

// ─────────────────────────────────────────────
//  SETUP
// ─────────────────────────────────────────────
function setup() {
  let cnv = createCanvas(350, 560);
  cnv.elt.setAttribute('tabindex', '0');
  cnv.elt.focus();
  cnv.mousePressed(() => cnv.elt.focus());
  imageMode(CENTER);

  audioContext = getAudioContext();
  mic = new p5.AudioIn();
  mic.start(iniciarPitch);
  userStartAudio();

  gestorAmp   = new GestorSenial(AMP_MIN, AMP_MAX);
  gestorPitch = new GestorSenial(FREC_MIN, FREC_MAX);

  generarCirculos();
}

// ─────────────────────────────────────────────
//  INICIAR PITCH
// ─────────────────────────────────────────────
function iniciarPitch() {
  pitch = ml5.pitchDetection(MODEL_URL, audioContext, mic.stream, modeloListo);
}

function modeloListo() {
  modeloCargado = true;
  obtenerPitch();
}

function obtenerPitch() {
  pitch.getPitch(function(err, frecuencia) {
    if (frecuencia) {
      gestorPitch.actualizar(frecuencia);
    }
    obtenerPitch();
  });
}

// ─────────────────────────────────────────────
//  GENERACIÓN DE CÍRCULOS
// ─────────────────────────────────────────────
function generarCirculos() {
  circulos = [];
  for (let i = 0; i < CANTIDAD_CIRCULOS; i++) {
    circulos.push(new Circulo());
  }
}

// ─────────────────────────────────────────────
//  DRAW
// ─────────────────────────────────────────────
function draw() {
  background(0);

  if (modeloCargado) procesarAudio();

  actualizarBrilloAnimado();

  drawingContext.filter = `brightness(${brilloAnimado}%)`;

  for (let c of circulos) {
    c.dibujar(); 
  }

  drawingContext.filter = 'none';

  // Marco blanco
  noStroke();
  fill(255);
  rect(0, 0, width, MARCO);
  rect(0, height - MARCO, width, MARCO);
  rect(0, 0, MARCO, height);
  rect(width - MARCO, 0, MARCO, height);

  mostrarCalibracion();
}

// ─────────────────────────────────────────────
//  ANIMACIÓN DE BRILLO
// ─────────────────────────────────────────────
function actualizarBrilloAnimado() {
  let t = constrain((millis() - tiempoInicioBrillo) / DURACION_TRANSICION_BRILLO, 0, 1);
  t = t * t * (3 - 2 * t);
  brilloAnimado = lerp(brilloDesde, brilloHasta, t);
}

function iniciarTransicionBrillo() {
  brilloDesde        = brilloAnimado;
  brilloHasta         = NIVELES_BRILLO[nivelBrillo];
  tiempoInicioBrillo = millis();
}

// ─────────────────────────────────────────────
//  PROCESAMIENTO DE AUDIO
// ─────────────────────────────────────────────
function procesarAudio() {
  let ahora = millis();

  gestorAmp.actualizar(mic.getLevel());

  let haySonido      = gestorAmp.filtrada > UMBRAL_VOLUMEN;
  let inicioElSonido = haySonido && !antesHabiaSonido;
  let finDelSonido   = !haySonido && antesHabiaSonido;

  if (inicioElSonido) {
    sonidoActivo             = true;
    tiempoInicioSonido       = ahora;
    volumenPicoSonido        = gestorAmp.filtrada;
    frecMasGrave             = gestorPitch.filtrada;
    frecMasAguda             = gestorPitch.filtrada;
    sonidoMantenidoYaContado = false;
    intensidadTemblor = 1.0;
  }

  if (sonidoActivo && haySonido) {
    if (gestorAmp.filtrada > volumenPicoSonido) volumenPicoSonido = gestorAmp.filtrada;

    if (gestorPitch.filtrada < frecMasGrave) frecMasGrave = gestorPitch.filtrada;
    if (gestorPitch.filtrada > frecMasAguda) frecMasAguda = gestorPitch.filtrada;

    let duracion = ahora - tiempoInicioSonido;

    if (!sonidoMantenidoYaContado && duracion >= UMBRAL_MANTENIDO) {
      let distGrave = UMBRAL_FRECUENCIA - frecMasGrave;
      let distAguda = frecMasAguda - UMBRAL_FRECUENCIA;
      let esGrave   = distGrave > distAguda;

      if (ahora - ultimoMantenido > COOLDOWN) {
        if (esGrave) {
          cambiarBrillo();
        } else {
          resetEstados();
        }
        ultimoMantenido          = ahora;
        sonidoMantenidoYaContado = true;
      }
    }
  }

  if (finDelSonido) {
    // si el pico agudo se alejó más del umbral que el pico grave, es agudo, y viceversa
    let distGrave = UMBRAL_FRECUENCIA - frecMasGrave; // cuánto se metió hacia el lado grave
    let distAguda = frecMasAguda - UMBRAL_FRECUENCIA; // cuánto se metió hacia el lado agudo
    let esGrave   = distGrave > distAguda;

    if (!sonidoMantenidoYaContado) {
      if (esGrave && ahora - ultimoGrave > COOLDOWN) {
        avanzarGrave();
        ultimoGrave = ahora;
      } else if (!esGrave && ahora - ultimoAgudo > COOLDOWN) {
        avanzarAgudo();
        ultimoAgudo = ahora;
      }
    }

    tiempoFinSonido = ahora;
    sonidoActivo = false;
  }

  antesHabiaSonido = haySonido;
}

// ─────────────────────────────────────────────
//  MODO CALIBRACIÓN
// ─────────────────────────────────────────────
function mostrarCalibracion() {
  if (!modoCalibrar) return;

  let esSonido = gestorAmp.filtrada > UMBRAL_VOLUMEN;

  fill(0, 0, 0, 190);
  noStroke();
  rect(MARCO, MARCO, width - MARCO * 2, 140);

  textFont('monospace');
  textSize(11);

  fill(esSonido ? color(100, 255, 100) : color(180));
  text(`vol: ${gestorAmp.filtrada.toFixed(3)}  (umbral: ${UMBRAL_VOLUMEN})`, MARCO + 8, MARCO + 18);

  let esGraveAhora = gestorPitch.filtrada < UMBRAL_FRECUENCIA;
  let hzAprox = Math.round(map(gestorPitch.filtrada, 0, 1, FREC_MIN, FREC_MAX));
  fill(esGraveAhora ? color(100, 200, 255) : color(255, 120, 120));
  text(`freq: ${gestorPitch.filtrada.toFixed(2)}  (~${hzAprox} Hz)`, MARCO + 8, MARCO + 34);

  // Barra de frecuencia
  let barW   = width - MARCO * 2 - 16;
  let barVal = constrain(map(gestorPitch.filtrada, 0, 1, 0, barW), 0, barW);
  if (barVal < 2) barVal = 2;
  let corteX = UMBRAL_FRECUENCIA * barW;
  fill(40);
  rect(MARCO + 8, MARCO + 40, barW, 8);
  fill(esGraveAhora ? color(100, 200, 255) : color(255, 120, 120));
  rect(MARCO + 8, MARCO + 40, barVal, 8);
  stroke(255, 220, 80);
  line(MARCO + 8 + corteX, MARCO + 38, MARCO + 8 + corteX, MARCO + 50);
  noStroke();

  let tipo = '—';
  if (esSonido) {
    let dur = millis() - tiempoInicioSonido;
    if (dur >= UMBRAL_MANTENIDO) {
      let distGrave = UMBRAL_FRECUENCIA - frecMasGrave;
      let distAguda = frecMasAguda - UMBRAL_FRECUENCIA;
      tipo = distGrave > distAguda ? 'GRAVE MANTENIDO' : 'AGUDO MANTENIDO';
    } else {
      let distGrave = UMBRAL_FRECUENCIA - frecMasGrave;
      let distAguda = frecMasAguda - UMBRAL_FRECUENCIA;
      tipo = distGrave > distAguda ? 'grave corto' : 'agudo corto';
    }
  }
  fill(255, 220, 80);
  text(`tipo: ${tipo}`, MARCO + 8, MARCO + 68);

  fill(180);
  text(`grave: ${contadorGrave}/2  agudo: ${contadorAgudo}/2  brillo: ${nivelBrillo}/3 (${brilloAnimado.toFixed(0)}%)`, MARCO + 8, MARCO + 84);
  text(`Grave corto: azul   Agudo corto: rojo`, MARCO + 8, MARCO + 100);
  text(`Grave largo: brillo   Agudo largo: reinicio`, MARCO + 8, MARCO + 116);
  text(`M = cerrar`, MARCO + 8, MARCO + 132);
}

// ─────────────────────────────────────────────
//  LÓGICA DE COLOR POR POSICIÓN
// ─────────────────────────────────────────────
function imagenParaEstado(x, cGrave, cAgudo) {
  let esDerecha   = x > width / 2;
  let esIzquierda = !esDerecha;

  if (cGrave === 0 && cAgudo === 0) return imgBlanco;
  if (cGrave === 1 && cAgudo === 0) return esDerecha ? imgAzul : imgBlanco;
  if (cGrave === 2 && cAgudo === 0) return imgAzul;
  if (cGrave === 0 && cAgudo === 1) return esIzquierda ? imgRojo : imgBlanco;
  if (cGrave === 0 && cAgudo === 2) return imgRojo;
  if (cGrave === 1 && cAgudo === 1) return esIzquierda ? imgRojo : imgAzul;
  if (cGrave === 2) return imgAzul;
  if (cAgudo === 2) return imgRojo;

  return imgBlanco;
}

// ─────────────────────────────────────────────
//  TECLAS
// ─────────────────────────────────────────────
function keyPressed() {
  if (key === 'm' || key === 'M') modoCalibrar = !modoCalibrar;
  return false;
}

// ─────────────────────────────────────────────
//  LÓGICA DE CONTADORES
// ─────────────────────────────────────────────
function iniciarTransicionColor() {
  contadorGravePrev   = contadorGrave;
  contadorAgudoPrev   = contadorAgudo;
  tiempoInicioColor   = millis();
}

function avanzarGrave() {
  iniciarTransicionColor();

  if (contadorAgudo === 2 && contadorGrave === 0) {
    contadorGrave = 1; contadorAgudo = 1; return;
  }
  contadorGrave++;
  if (contadorGrave >= 3) { contadorGrave = 0; contadorAgudo = 0; }
  else if (contadorGrave === 2) { contadorAgudo = 0; }
}

function avanzarAgudo() {
  iniciarTransicionColor();

  if (contadorGrave === 2 && contadorAgudo === 0) {
    contadorGrave = 1; contadorAgudo = 1; return;
  }
  contadorAgudo++;
  if (contadorAgudo >= 3) { contadorAgudo = 0; contadorGrave = 0; }
  else if (contadorAgudo === 2) { contadorGrave = 0; }
}

function cambiarBrillo() {
  nivelBrillo += dirBrillo;
  if (nivelBrillo >= NIVELES_BRILLO.length - 1) {
    nivelBrillo = NIVELES_BRILLO.length - 1;
    dirBrillo   = -1;
  } else if (nivelBrillo <= 0) {
    nivelBrillo = 0;
    dirBrillo   = 1;
  }
  iniciarTransicionBrillo();
}

// ─────────────────────────────────────────────
//  REINICIO DE ESTADOS
//  Vuelve color (blanco) y brillo al mínimo (40%),
// ─────────────────────────────────────────────
function resetEstados() {
  iniciarTransicionColor();
  contadorGrave = 0;
  contadorAgudo = 0;

  nivelBrillo = 0;
  dirBrillo   = 1;
  iniciarTransicionBrillo();
  generarCirculos();
}

// ─────────────────────────────────────────────
//  CLASE CIRCULO
// ─────────────────────────────────────────────
class Circulo {
  constructor() {
    this.x   = random(0, width);
    this.y   = random(0, height);
    this.tam = random(TAMANIO_MIN, TAMANIO_MAX);
  }

dibujar() {
    if (!sonidoActivo) {
      intensidadTemblor = constrain(
        1 - (millis() - tiempoFinSonido) / DURACION_TEMBLOR,
        0, 1
      );
    }

    // Desplazamiento aleatorio según intensidad
    let dx = random(-FUERZA_TEMBLOR, FUERZA_TEMBLOR) * intensidadTemblor;
    let dy = random(-FUERZA_TEMBLOR, FUERZA_TEMBLOR) * intensidadTemblor;

    let imgActual = imagenParaEstado(this.x, contadorGrave, contadorAgudo);
    let t = (millis() - tiempoInicioColor) / DURACION_TRANSICION_COLOR;

    if (t < 1) {
      let imgPrev = imagenParaEstado(this.x, contadorGravePrev, contadorAgudoPrev);

      if (imgPrev !== imgActual) {
        drawingContext.globalAlpha = 1 - t;
        image(imgPrev, this.x + dx, this.y + dy, this.tam, this.tam);

        drawingContext.globalAlpha = t;
        image(imgActual, this.x + dx, this.y + dy, this.tam, this.tam);

        drawingContext.globalAlpha = 1.0;
        return;
      }
    }

    drawingContext.globalAlpha = 1.0;
    image(imgActual, this.x + dx, this.y + dy, this.tam, this.tam);
  }
}