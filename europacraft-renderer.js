/* ============================================================================
   EuropaCraft Weather Simulator
   Renderer
   File: europacraft-renderer.js
   Version 7.5

   COMPLETE FILE REPLACEMENT

   Main changes
   ------------
   - Cached land shading and coastline
   - Reads land mask directly from weather.terrain.land if necessary
   - Smooth visual interpolation between 4-minute atmospheric states
   - Curved steering-path drawing
   - Freehand steering drag capture
   - Much less repeated geography work
   - Existing overlay API retained
============================================================================ */

(function (global) {
"use strict";

const U = global.EuropaUtils;
const C = global.EuropaConfig;

if (!U) {
    throw new Error("EuropaRenderer requires EuropaUtils.");
}

if (!C) {
    throw new Error("EuropaRenderer requires EuropaConfig.");
}


/* ============================================================================
   DEFAULTS
============================================================================ */

const DEFAULTS = Object.freeze({
    width: Number(C.display && C.display.width) || 780,
    height: Number(C.display && C.display.height) || 440,

    layer: (C.display && C.display.defaultLayer) || "temperature",

    isobars:
        C.display && C.display.isobars !== undefined
            ? !!C.display.isobars
            : true,

    isobarIntervalHpa:
        Number(C.display && C.display.isobarIntervalHpa) || 4,

    windVectors:
        C.display && C.display.windVectors !== undefined
            ? !!C.display.windVectors
            : false,

    windVectorSpacing: 44,

    frontOverlay: false,
    systemMarkers: true,
    steeringArrows: true,

    coastline: true,
    landShading: true,

    dragToolEnabled: false,

    /*
     * This is visual interpolation only.
     *
     * The atmosphere itself continues to solve at the proper 4-minute
     * physical timestep.
     */
    visualTransitionMs: 900
});


/* ============================================================================
   GENERAL HELPERS
============================================================================ */

function finite(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}


function clamp255(value) {
    return Math.max(
        0,
        Math.min(
            255,
            Math.round(value)
        )
    );
}


function rgba(r, g, b, a = 255) {
    return [
        clamp255(r),
        clamp255(g),
        clamp255(b),
        clamp255(a)
    ];
}


function mixColour(a, b, t) {
    t = U.clamp(t, 0, 1);

    return rgba(
        U.lerp(a[0], b[0], t),
        U.lerp(a[1], b[1], t),
        U.lerp(a[2], b[2], t),
        U.lerp(
            a[3] === undefined ? 255 : a[3],
            b[3] === undefined ? 255 : b[3],
            t
        )
    );
}


function colourRamp(value, stops) {
    if (value <= stops[0][0]) {
        return stops[0][1];
    }

    const last = stops[stops.length - 1];

    if (value >= last[0]) {
        return last[1];
    }

    for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i];
        const b = stops[i + 1];

        if (value >= a[0] && value <= b[0]) {
            const t = (value - a[0]) / (b[0] - a[0]);

            return mixColour(
                a[1],
                b[1],
                t
            );
        }
    }

    return last[1];
}


function bilinearSample(field, nx, ny, x, y) {
    if (!field || !field.length) {
        return 0;
    }

    x = U.clamp(x, 0, nx - 1);
    y = U.clamp(y, 0, ny - 1);

    const x0 = Math.floor(x);
    const y0 = Math.floor(y);

    const x1 = Math.min(nx - 1, x0 + 1);
    const y1 = Math.min(ny - 1, y0 + 1);

    const tx = x - x0;
    const ty = y - y0;

    const i00 = y0 * nx + x0;
    const i10 = y0 * nx + x1;
    const i01 = y1 * nx + x0;
    const i11 = y1 * nx + x1;

    const top = U.lerp(
        field[i00],
        field[i10],
        tx
    );

    const bottom = U.lerp(
        field[i01],
        field[i11],
        tx
    );

    return U.lerp(
        top,
        bottom,
        ty
    );
}


function makeCanvas(width, height) {
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    return canvas;
}


/* ============================================================================
   COLOUR TABLES
============================================================================ */

const TEMP_STOPS = [
    [-35, rgba(70, 35, 130)],
    [-25, rgba(70, 75, 180)],
    [-15, rgba(65, 135, 220)],
    [-8, rgba(75, 190, 230)],
    [-2, rgba(150, 225, 225)],
    [3, rgba(195, 235, 170)],
    [8, rgba(225, 235, 90)],
    [14, rgba(245, 205, 75)],
    [20, rgba(250, 155, 55)],
    [26, rgba(235, 90, 45)],
    [32, rgba(195, 45, 45)],
    [40, rgba(125, 25, 30)]
];


const ANOMALY_STOPS = [
    [-15, rgba(45, 35, 130)],
    [-10, rgba(60, 80, 190)],
    [-6, rgba(70, 145, 225)],
    [-3, rgba(130, 195, 235)],
    [-1, rgba(205, 230, 240)],
    [0, rgba(235, 235, 225)],
    [1, rgba(245, 220, 185)],
    [3, rgba(245, 175, 110)],
    [6, rgba(230, 105, 65)],
    [10, rgba(185, 50, 50)],
    [15, rgba(110, 25, 45)]
];


const PRESSURE_STOPS = [
    [960, rgba(70, 60, 150)],
    [980, rgba(75, 115, 195)],
    [995, rgba(105, 175, 210)],
    [1010, rgba(180, 220, 180)],
    [1020, rgba(225, 225, 125)],
    [1030, rgba(245, 175, 75)],
    [1045, rgba(220, 90, 60)]
];


const WIND_STOPS = [
    [0, rgba(225, 235, 225)],
    [3, rgba(175, 220, 195)],
    [7, rgba(100, 190, 185)],
    [12, rgba(65, 145, 190)],
    [18, rgba(85, 100, 175)],
    [25, rgba(120, 65, 155)],
    [35, rgba(165, 50, 120)],
    [50, rgba(205, 45, 70)]
];


const CLOUD_STOPS = [
    [0, rgba(38, 52, 62)],
    [0.15, rgba(72, 84, 92)],
    [0.35, rgba(110, 120, 125)],
    [0.60, rgba(155, 160, 162)],
    [0.80, rgba(205, 207, 207)],
    [1.00, rgba(245, 245, 245)]
];


const PRECIP_STOPS = [
    [0, rgba(25, 40, 50)],
    [0.05, rgba(80, 110, 130)],
    [0.2, rgba(70, 160, 185)],
    [1, rgba(65, 190, 120)],
    [3, rgba(220, 205, 70)],
    [8, rgba(235, 135, 55)],
    [20, rgba(210, 65, 55)],
    [50, rgba(155, 45, 130)],
    [80, rgba(90, 35, 115)]
];


const SNOW_STOPS = [
    [0, rgba(40, 55, 60)],
    [0.1, rgba(135, 170, 185)],
    [1, rgba(180, 210, 225)],
    [5, rgba(220, 235, 245)],
    [15, rgba(245, 248, 250)],
    [40, rgba(220, 225, 250)],
    [100, rgba(180, 185, 240)]
];


const SST_STOPS = [
    [-2, rgba(70, 100, 180)],
    [2, rgba(75, 145, 205)],
    [6, rgba(90, 185, 210)],
    [10, rgba(120, 210, 185)],
    [15, rgba(210, 220, 105)],
    [20, rgba(245, 180, 70)],
    [25, rgba(235, 110, 55)],
    [30, rgba(180, 55, 50)]
];


const FRONT_STOPS = [
    [0, rgba(40, 50, 55)],
    [0.1, rgba(60, 90, 105)],
    [0.25, rgba(80, 140, 170)],
    [0.5, rgba(210, 210, 90)],
    [0.75, rgba(240, 135, 60)],
    [1, rgba(220, 55, 55)]
];


const COLOUR_SCALES = Object.freeze({
    temperature: TEMP_STOPS,
    anomaly: ANOMALY_STOPS,
    pressure: PRESSURE_STOPS,
    wind: WIND_STOPS,
    cloud: CLOUD_STOPS,
    precipitation: PRECIP_STOPS,
    snow: SNOW_STOPS,
    sst: SST_STOPS,
    fronts: FRONT_STOPS
});


/* ============================================================================
   RENDERER
============================================================================ */

class EuropaRenderer {

    constructor(weather, canvasOrId, options = {}) {
        if (!weather) {
            throw new Error("EuropaRenderer requires a weather controller.");
        }

        this.weather = weather;

        this.canvas =
            typeof canvasOrId === "string"
                ? document.getElementById(canvasOrId)
                : canvasOrId;

        if (!this.canvas) {
            throw new Error("EuropaRenderer could not find its canvas.");
        }

        this.ctx = this.canvas.getContext("2d");

        if (!this.ctx) {
            throw new Error("EuropaRenderer could not obtain a 2D context.");
        }

        this.options = Object.assign(
            {},
            DEFAULTS,
            options
        );

        this.width = finite(
            this.options.width,
            780
        );

        this.height = finite(
            this.options.height,
            440
        );

        this.canvas.width = this.width;
        this.canvas.height = this.height;

        this.layer = this.options.layer;

        this.lastRenderMs = 0;

        this.lastWeatherTime = null;

        this.transitionStart = 0;

        this.transitionDuration = Math.max(
            0,
            finite(
                this.options.visualTransitionMs,
                900
            )
        );

        this.transitionAnimating = false;

        this.animationFrame = null;

        this.fieldCanvasPrevious = makeCanvas(
            this.width,
            this.height
        );

        this.fieldCanvasCurrent = makeCanvas(
            this.width,
            this.height
        );

        this.fieldCtxPrevious =
            this.fieldCanvasPrevious.getContext("2d");

        this.fieldCtxCurrent =
            this.fieldCanvasCurrent.getContext("2d");

        this.geographyCanvas = makeCanvas(
            this.width,
            this.height
        );

        this.geographyCtx =
            this.geographyCanvas.getContext("2d");

        this.isobarCanvas = makeCanvas(
            this.width,
            this.height
        );

        this.isobarCtx =
            this.isobarCanvas.getContext("2d");

        this._imageData =
            this.fieldCtxCurrent.createImageData(
                this.width,
                this.height
            );

        this._displayX =
            new Float32Array(
                this.width
            );

        this._displayY =
            new Float32Array(
                this.height
            );

        this.geographyDirty = true;
        this.isobarDirty = true;

        this.committedCurves = [];

        this.drag = {
            active: false,
            points: [],
            lastPixelX: 0,
            lastPixelY: 0
        };

        this._buildLookup();

        this._bindPointerEvents();

        this.rebuildGeography();

        this.render(true);
    }


    /* ========================================================================
       GRID
       ======================================================================== */

    _getFields() {
        return this.weather.getFields();
    }


    _getTerrain() {
        return this.weather.terrain || null;
    }


    _getLandArray(fields) {
        if (
            fields &&
            fields.land &&
            fields.land.length
        ) {
            return fields.land;
        }

        const terrain = this._getTerrain();

        if (
            terrain &&
            terrain.land &&
            terrain.land.length
        ) {
            return terrain.land;
        }

        return null;
    }


    _buildLookup() {
        const fields = this._getFields();

        const nx = fields.nx;
        const ny = fields.ny;

        for (let x = 0; x < this.width; x++) {
            this._displayX[x] =
                x /
                Math.max(
                    1,
                    this.width - 1
                ) *
                (nx - 1);
        }

        for (let y = 0; y < this.height; y++) {
            this._displayY[y] =
                y /
                Math.max(
                    1,
                    this.height - 1
                ) *
                (ny - 1);
        }
    }


    /* ========================================================================
       COORDINATES
       ======================================================================== */

    pixelToGeo(x, y) {
        return {
            lon:
                C.bounds.west +
                x /
                this.width *
                (
                    C.bounds.east -
                    C.bounds.west
                ),

            lat:
                C.bounds.north -
                y /
                this.height *
                (
                    C.bounds.north -
                    C.bounds.south
                )
        };
    }


    geoToPixel(lat, lon) {
        return {
            x:
                (
                    lon -
                    C.bounds.west
                ) /
                (
                    C.bounds.east -
                    C.bounds.west
                ) *
                this.width,

            y:
                (
                    C.bounds.north -
                    lat
                ) /
                (
                    C.bounds.north -
                    C.bounds.south
                ) *
                this.height
        };
    }


    _eventPosition(event) {
        const rect =
            this.canvas.getBoundingClientRect();

        return {
            x:
                (
                    event.clientX -
                    rect.left
                ) *
                this.width /
                rect.width,

            y:
                (
                    event.clientY -
                    rect.top
                ) *
                this.height /
                rect.height
        };
    }


    /* ========================================================================
       FREEHAND / CURVED DRAG
       ======================================================================== */

    _bindPointerEvents() {
        this._pointerDown = event => {
            const p = this._eventPosition(event);

            if (!this.options.dragToolEnabled) {
                this._emitHover(
                    p.x,
                    p.y
                );

                return;
            }

            const geo =
                this.pixelToGeo(
                    p.x,
                    p.y
                );

            this.drag.active = true;

            this.drag.points = [{
                x: p.x,
                y: p.y,
                lat: geo.lat,
                lon: geo.lon
            }];

            this.drag.lastPixelX = p.x;
            this.drag.lastPixelY = p.y;

            try {
                this.canvas.setPointerCapture(
                    event.pointerId
                );
            } catch (error) {
                // harmless
            }

            event.preventDefault();

            this._drawComposite();
        };


        this._pointerMove = event => {
            const p = this._eventPosition(event);

            if (!this.drag.active) {
                this._emitHover(
                    p.x,
                    p.y
                );

                return;
            }

            const movement = Math.hypot(
                p.x - this.drag.lastPixelX,
                p.y - this.drag.lastPixelY
            );

            /*
             * Do not save every single browser mouse event.
             *
             * This gives a smooth curve while keeping point count controlled.
             */
            if (movement >= 4) {
                const geo =
                    this.pixelToGeo(
                        p.x,
                        p.y
                    );

                this.drag.points.push({
                    x: p.x,
                    y: p.y,
                    lat: geo.lat,
                    lon: geo.lon
                });

                this.drag.lastPixelX = p.x;
                this.drag.lastPixelY = p.y;
            }

            if (
                typeof this.options.onSteeringPreview ===
                "function"
            ) {
                const points =
                    this.drag.points;

                if (points.length >= 2) {
                    const first = points[0];
                    const last =
                        points[
                            points.length - 1
                        ];

                    this.options.onSteeringPreview({
                        points:
                            points.map(point => ({
                                lat: point.lat,
                                lon: point.lon
                            })),

                        sourceLat:
                            first.lat,

                        sourceLon:
                            first.lon,

                        targetLat:
                            last.lat,

                        targetLon:
                            last.lon,

                        distanceKm:
                            this._pathDistanceKm(
                                points
                            )
                    });
                }
            }

            this._drawComposite();

            event.preventDefault();
        };


        this._pointerUp = event => {
            if (!this.drag.active) {
                return;
            }

            const p =
                this._eventPosition(
                    event
                );

            const geo =
                this.pixelToGeo(
                    p.x,
                    p.y
                );

            const last =
                this.drag.points[
                    this.drag.points.length - 1
                ];

            if (
                !last ||
                Math.hypot(
                    p.x - last.x,
                    p.y - last.y
                ) > 1
            ) {
                this.drag.points.push({
                    x: p.x,
                    y: p.y,
                    lat: geo.lat,
                    lon: geo.lon
                });
            }

            const rawPoints =
                this.drag.points.slice();

            this.drag.active = false;

            try {
                this.canvas.releasePointerCapture(
                    event.pointerId
                );
            } catch (error) {
                // harmless
            }

            const simplified =
                this._simplifyPath(
                    rawPoints,
                    7
                );

            if (
                simplified.length >= 2 &&
                this._pathDistanceKm(
                    simplified
                ) >= 40
            ) {
                const first = simplified[0];

                const lastPoint =
                    simplified[
                        simplified.length - 1
                    ];

                if (
                    typeof this.options.onSteeringDrag ===
                    "function"
                ) {
                    this.options.onSteeringDrag({
                        points:
                            simplified.map(point => ({
                                lat: point.lat,
                                lon: point.lon
                            })),

                        sourceLat:
                            first.lat,

                        sourceLon:
                            first.lon,

                        targetLat:
                            lastPoint.lat,

                        targetLon:
                            lastPoint.lon,

                        distanceKm:
                            this._pathDistanceKm(
                                simplified
                            )
                    });
                }
            }

            this.drag.points = [];

            this._drawComposite();

            event.preventDefault();
        };


        this._pointerCancel = () => {
            this.drag.active = false;
            this.drag.points = [];

            this._drawComposite();
        };


        this.canvas.addEventListener(
            "pointerdown",
            this._pointerDown
        );

        this.canvas.addEventListener(
            "pointermove",
            this._pointerMove
        );

        this.canvas.addEventListener(
            "pointerup",
            this._pointerUp
        );

        this.canvas.addEventListener(
            "pointercancel",
            this._pointerCancel
        );
    }


    _pathDistanceKm(points) {
        let total = 0;

        for (
            let i = 1;
            i < points.length;
            i++
        ) {
            total += U.haversineKm(
                points[i - 1].lat,
                points[i - 1].lon,
                points[i].lat,
                points[i].lon
            );
        }

        return total;
    }


    _simplifyPath(points, maxPoints) {
        if (
            points.length <= maxPoints
        ) {
            return points.slice();
        }

        const output = [];

        const count =
            Math.max(
                2,
                maxPoints
            );

        for (
            let i = 0;
            i < count;
            i++
        ) {
            const position =
                i /
                (
                    count - 1
                ) *
                (
                    points.length - 1
                );

            output.push(
                points[
                    Math.round(position)
                ]
            );
        }

        return output;
    }


    _emitHover(x, y) {
        if (
            typeof this.options.onHover !==
            "function"
        ) {
            return;
        }

        const geo =
            this.pixelToGeo(
                x,
                y
            );

        let sample = null;

        try {
            sample =
                this.weather.sample(
                    geo.lat,
                    geo.lon
                );
        } catch (error) {
            sample = null;
        }

        this.options.onHover({
            x,
            y,
            lat: geo.lat,
            lon: geo.lon,
            sample
        });
    }


    /* ========================================================================
       CURVES
       ======================================================================== */

    addCommittedCurve(points, metadata = {}) {
        if (
            !points ||
            points.length < 2
        ) {
            return null;
        }

        const curve = {
            id:
                "curve-" +
                Date.now() +
                "-" +
                Math.random()
                    .toString(36)
                    .slice(2),

            points:
                points.map(point => ({
                    lat:
                        finite(
                            point.lat
                        ),

                    lon:
                        finite(
                            point.lon
                        )
                })),

            metadata:
                Object.assign(
                    {},
                    metadata
                )
        };

        this.committedCurves.push(
            curve
        );

        this._drawComposite();

        return curve;
    }


    clearCommittedCurves() {
        this.committedCurves.length = 0;

        this._drawComposite();
    }


    setCommittedCurves(curves) {
        this.committedCurves =
            Array.isArray(curves)
                ? curves.slice()
                : [];

        this._drawComposite();
    }


    _drawSmoothPath(
        ctx,
        points,
        options = {}
    ) {
        if (
            !points ||
            points.length < 2
        ) {
            return;
        }

        const pixelPoints =
            points.map(point => {
                if (
                    point.x !== undefined &&
                    point.y !== undefined
                ) {
                    return {
                        x: point.x,
                        y: point.y
                    };
                }

                return this.geoToPixel(
                    point.lat,
                    point.lon
                );
            });

        ctx.save();

        ctx.strokeStyle =
            options.stroke ||
            "rgba(40,32,22,0.90)";

        ctx.lineWidth =
            finite(
                options.width,
                3
            );

        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        if (options.dashed) {
            ctx.setLineDash([
                8,
                5
            ]);
        }

        ctx.beginPath();

        ctx.moveTo(
            pixelPoints[0].x,
            pixelPoints[0].y
        );

        if (pixelPoints.length === 2) {
            ctx.lineTo(
                pixelPoints[1].x,
                pixelPoints[1].y
            );
        } else {
            for (
                let i = 1;
                i < pixelPoints.length - 1;
                i++
            ) {
                const current =
                    pixelPoints[i];

                const next =
                    pixelPoints[
                        i + 1
                    ];

                const midX =
                    (
                        current.x +
                        next.x
                    ) /
                    2;

                const midY =
                    (
                        current.y +
                        next.y
                    ) /
                    2;

                ctx.quadraticCurveTo(
                    current.x,
                    current.y,
                    midX,
                    midY
                );
            }

            const secondLast =
                pixelPoints[
                    pixelPoints.length - 2
                ];

            const last =
                pixelPoints[
                    pixelPoints.length - 1
                ];

            ctx.quadraticCurveTo(
                secondLast.x,
                secondLast.y,
                last.x,
                last.y
            );
        }

        ctx.stroke();

        ctx.setLineDash([]);

        const previous =
            pixelPoints[
                pixelPoints.length - 2
            ];

        const end =
            pixelPoints[
                pixelPoints.length - 1
            ];

        const angle =
            Math.atan2(
                end.y - previous.y,
                end.x - previous.x
            );

        const size =
            finite(
                options.headSize,
                12
            );

        ctx.fillStyle =
            options.stroke ||
            "rgba(40,32,22,0.90)";

        ctx.beginPath();

        ctx.moveTo(
            end.x,
            end.y
        );

        ctx.lineTo(
            end.x -
            Math.cos(
                angle -
                0.55
            ) *
            size,

            end.y -
            Math.sin(
                angle -
                0.55
            ) *
            size
        );

        ctx.lineTo(
            end.x -
            Math.cos(
                angle +
                0.55
            ) *
            size,

            end.y -
            Math.sin(
                angle +
                0.55
            ) *
            size
        );

        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }


    /* ========================================================================
       STATIC GEOGRAPHY CACHE
       ======================================================================== */

    rebuildGeography() {
        this.geographyDirty = false;

        const fields =
            this._getFields();

        const land =
            this._getLandArray(
                fields
            );

        const ctx =
            this.geographyCtx;

        ctx.clearRect(
            0,
            0,
            this.width,
            this.height
        );

        if (!land) {
            return;
        }

        const nx =
            fields.nx;

        const ny =
            fields.ny;

        const cellW =
            this.width /
            nx;

        const cellH =
            this.height /
            ny;


        /*
         * LAND TINT

         * Drawn once only.
         */
        if (this.options.landShading) {
            ctx.fillStyle =
                "rgba(18,15,10,0.075)";

            for (
                let y = 0;
                y < ny;
                y++
            ) {
                for (
                    let x = 0;
                    x < nx;
                    x++
                ) {
                    const i =
                        y *
                        nx +
                        x;

                    if (
                        land[i] >= 0.5
                    ) {
                        ctx.fillRect(
                            x * cellW,
                            y * cellH,
                            cellW + 1,
                            cellH + 1
                        );
                    }
                }
            }
        }


        /*
         * COASTLINE

         * Drawn once into the geography canvas.
         */
        if (this.options.coastline) {
            ctx.save();

            ctx.strokeStyle =
                "rgba(20,24,22,0.92)";

            ctx.lineWidth = 1.25;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";

            ctx.beginPath();

            for (
                let y = 0;
                y < ny - 1;
                y++
            ) {
                for (
                    let x = 0;
                    x < nx - 1;
                    x++
                ) {
                    const i =
                        y *
                        nx +
                        x;

                    const here =
                        land[i] >= 0.5;

                    const right =
                        land[i + 1] >=
                        0.5;

                    const below =
                        land[i + nx] >=
                        0.5;

                    if (
                        here !== right
                    ) {
                        const px =
                            (
                                x +
                                0.5
                            ) *
                            cellW;

                        ctx.moveTo(
                            px,
                            y * cellH
                        );

                        ctx.lineTo(
                            px,
                            (
                                y +
                                1
                            ) *
                            cellH
                        );
                    }

                    if (
                        here !== below
                    ) {
                        const py =
                            (
                                y +
                                0.5
                            ) *
                            cellH;

                        ctx.moveTo(
                            x * cellW,
                            py
                        );

                        ctx.lineTo(
                            (
                                x +
                                1
                            ) *
                            cellW,
                            py
                        );
                    }
                }
            }

            ctx.stroke();

            ctx.restore();
        }
    }


    /* ========================================================================
       WEATHER RASTER
       ======================================================================== */

    _fieldForLayer(fields) {
        switch (this.layer) {
            case "temperature":
                return fields.temperatureC;

            case "anomaly":
                return fields.anomalyC;

            case "pressure":
                return fields.pressureHpa;

            case "wind":
                return fields.windSpeed;

            case "cloud":
                return fields.cloudFraction;

            case "precipitation":
                return fields.precipRateMmHr;

            case "snow":
                return fields.snowDepthCm;

            case "sst":
                return fields.sst;

            case "fronts":
                return fields.frontStrength;

            default:
                return fields.temperatureC;
        }
    }


    _colourForValue(value) {
        switch (this.layer) {
            case "temperature":
                return colourRamp(
                    value,
                    TEMP_STOPS
                );

            case "anomaly":
                return colourRamp(
                    value,
                    ANOMALY_STOPS
                );

            case "pressure":
                return colourRamp(
                    value,
                    PRESSURE_STOPS
                );

            case "wind":
                return colourRamp(
                    value,
                    WIND_STOPS
                );

            case "cloud":
                return colourRamp(
                    value,
                    CLOUD_STOPS
                );

            case "precipitation":
                return colourRamp(
                    value,
                    PRECIP_STOPS
                );

            case "snow":
                return colourRamp(
                    value,
                    SNOW_STOPS
                );

            case "sst":
                return colourRamp(
                    value,
                    SST_STOPS
                );

            case "fronts":
                return colourRamp(
                    value,
                    FRONT_STOPS
                );

            default:
                return rgba(
                    100,
                    100,
                    100
                );
        }
    }


    _renderWeatherField(
        targetCtx,
        fields
    ) {
        const field =
            this._fieldForLayer(
                fields
            );

        if (!field) {
            return;
        }

        const nx =
            fields.nx;

        const ny =
            fields.ny;

        const land =
            this._getLandArray(
                fields
            );

        const data =
            this._imageData.data;

        let pointer = 0;

        for (
            let y = 0;
            y < this.height;
            y++
        ) {
            const gy =
                this._displayY[y];

            for (
                let x = 0;
                x < this.width;
                x++
            ) {
                const gx =
                    this._displayX[x];

                if (
                    this.layer === "sst" &&
                    land
                ) {
                    const landValue =
                        bilinearSample(
                            land,
                            nx,
                            ny,
                            gx,
                            gy
                        );

                    if (
                        landValue >
                        0.5
                    ) {
                        data[pointer++] = 80;
                        data[pointer++] = 84;
                        data[pointer++] = 76;
                        data[pointer++] = 255;

                        continue;
                    }
                }

                const value =
                    bilinearSample(
                        field,
                        nx,
                        ny,
                        gx,
                        gy
                    );

                const colour =
                    this._colourForValue(
                        value
                    );

                data[pointer++] =
                    colour[0];

                data[pointer++] =
                    colour[1];

                data[pointer++] =
                    colour[2];

                data[pointer++] =
                    255;
            }
        }

        targetCtx.putImageData(
            this._imageData,
            0,
            0
        );
    }


    /* ========================================================================
       ISOBAR CACHE
       ======================================================================== */

    _rebuildIsobars(fields) {
        const ctx =
            this.isobarCtx;

        ctx.clearRect(
            0,
            0,
            this.width,
            this.height
        );

        if (
            !this.options.isobars ||
            !fields.pressureHpa
        ) {
            return;
        }

        const pressure =
            fields.pressureHpa;

        const nx =
            fields.nx;

        const ny =
            fields.ny;

        let minimum = Infinity;
        let maximum = -Infinity;

        for (
            let i = 0;
            i < pressure.length;
            i++
        ) {
            const p =
                pressure[i];

            minimum =
                Math.min(
                    minimum,
                    p
                );

            maximum =
                Math.max(
                    maximum,
                    p
                );
        }

        const interval =
            Math.max(
                1,
                finite(
                    this.options.isobarIntervalHpa,
                    4
                )
            );

        const first =
            Math.ceil(
                minimum /
                interval
            ) *
            interval;

        const last =
            Math.floor(
                maximum /
                interval
            ) *
            interval;

        const dx =
            this.width /
            (
                nx - 1
            );

        const dy =
            this.height /
            (
                ny - 1
            );

        ctx.save();

        ctx.strokeStyle =
            "rgba(35,40,38,0.58)";

        ctx.lineWidth = 1;

        for (
            let level = first;
            level <= last;
            level += interval
        ) {
            ctx.beginPath();

            for (
                let y = 0;
                y < ny - 1;
                y++
            ) {
                for (
                    let x = 0;
                    x < nx - 1;
                    x++
                ) {
                    const i00 =
                        y *
                        nx +
                        x;

                    const i10 =
                        i00 +
                        1;

                    const i01 =
                        i00 +
                        nx;

                    const i11 =
                        i01 +
                        1;

                    const values = [
                        pressure[i00],
                        pressure[i10],
                        pressure[i11],
                        pressure[i01]
                    ];

                    const positions = [
                        [x, y],
                        [x + 1, y],
                        [x + 1, y + 1],
                        [x, y + 1]
                    ];

                    const intersections = [];

                    for (
                        let edge = 0;
                        edge < 4;
                        edge++
                    ) {
                        const next =
                            (
                                edge +
                                1
                            ) %
                            4;

                        const a =
                            values[edge];

                        const b =
                            values[next];

                        if (
                            (
                                a <
                                level &&
                                b >=
                                level
                            ) ||
                            (
                                a >=
                                level &&
                                b <
                                level
                            )
                        ) {
                            const t =
                                (
                                    level -
                                    a
                                ) /
                                (
                                    b -
                                    a
                                );

                            intersections.push({
                                x:
                                    U.lerp(
                                        positions[edge][0],
                                        positions[next][0],
                                        t
                                    ),

                                y:
                                    U.lerp(
                                        positions[edge][1],
                                        positions[next][1],
                                        t
                                    )
                            });
                        }
                    }

                    if (
                        intersections.length >=
                        2
                    ) {
                        ctx.moveTo(
                            intersections[0].x *
                            dx,

                            intersections[0].y *
                            dy
                        );

                        ctx.lineTo(
                            intersections[1].x *
                            dx,

                            intersections[1].y *
                            dy
                        );
                    }
                }
            }

            ctx.stroke();
        }

        ctx.restore();
    }


    /* ========================================================================
       OVERLAYS
       ======================================================================== */

    _drawWindVectors(fields) {
        if (
            !this.options.windVectors ||
            !fields.windU ||
            !fields.windV
        ) {
            return;
        }

        const spacing =
            Math.max(
                28,
                finite(
                    this.options.windVectorSpacing,
                    44
                )
            );

        const nx =
            fields.nx;

        const ny =
            fields.ny;

        const ctx =
            this.ctx;

        ctx.save();

        ctx.strokeStyle =
            "rgba(15,20,22,0.68)";

        ctx.fillStyle =
            "rgba(15,20,22,0.68)";

        ctx.lineWidth = 1.1;

        for (
            let py = spacing / 2;
            py < this.height;
            py += spacing
        ) {
            for (
                let px = spacing / 2;
                px < this.width;
                px += spacing
            ) {
                const gx =
                    px /
                    this.width *
                    (
                        nx - 1
                    );

                const gy =
                    py /
                    this.height *
                    (
                        ny - 1
                    );

                const u =
                    bilinearSample(
                        fields.windU,
                        nx,
                        ny,
                        gx,
                        gy
                    );

                const v =
                    bilinearSample(
                        fields.windV,
                        nx,
                        ny,
                        gx,
                        gy
                    );

                const speed =
                    Math.hypot(
                        u,
                        v
                    );

                if (
                    speed <
                    0.25
                ) {
                    continue;
                }

                const length =
                    7 +
                    Math.min(
                        13,
                        speed *
                        0.45
                    );

                const dx =
                    u /
                    speed *
                    length;

                const dy =
                    -v /
                    speed *
                    length;

                ctx.beginPath();

                ctx.moveTo(
                    px,
                    py
                );

                ctx.lineTo(
                    px + dx,
                    py + dy
                );

                ctx.stroke();
            }
        }

        ctx.restore();
    }


    _drawSystems() {
        if (
            !this.options.systemMarkers
        ) {
            return;
        }

        let systems = [];

        try {
            if (
                typeof this.weather.getSystems ===
                "function"
            ) {
                systems =
                    this.weather.getSystems() ||
                    [];
            } else if (
                this.weather.synoptic &&
                Array.isArray(
                    this.weather.synoptic.systems
                )
            ) {
                systems =
                    this.weather.synoptic.systems;
            }
        } catch (error) {
            systems = [];
        }

        const ctx =
            this.ctx;

        ctx.save();

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (
            const system of systems
        ) {
            if (
                system.active ===
                false
            ) {
                continue;
            }

            const point =
                this.geoToPixel(
                    system.lat,
                    system.lon
                );

            const low =
                String(
                    system.type
                ).toLowerCase() ===
                "low";

            ctx.fillStyle =
                low
                    ? "rgba(40,85,220,0.90)"
                    : "rgba(220,65,50,0.90)";

            ctx.font =
                "bold 27px Arial";

            ctx.fillText(
                low ? "L" : "H",
                point.x,
                point.y - 5
            );

            ctx.font =
                "bold 12px Arial";

            ctx.fillText(
                Math.round(
                    finite(
                        system.pressureHpa,
                        1013
                    )
                ) +
                " hPa",

                point.x,
                point.y + 18
            );
        }

        ctx.restore();
    }


    _drawExistingStraightArrows() {
        if (
            !this.options.steeringArrows
        ) {
            return;
        }

        let arrows = [];

        try {
            if (
                typeof this.weather.getSteeringArrows ===
                "function"
            ) {
                arrows =
                    this.weather.getSteeringArrows() ||
                    [];
            } else if (
                this.weather.synoptic &&
                Array.isArray(
                    this.weather.synoptic.arrows
                )
            ) {
                arrows =
                    this.weather.synoptic.arrows;
            }
        } catch (error) {
            arrows = [];
        }

        /*
         * Raw backend segments are intentionally subtle.
         *
         * Curved groups are drawn more prominently afterwards.
         */
        for (
            const arrow of arrows
        ) {
            const sourceLat =
                finite(
                    arrow.sourceLat !== undefined
                        ? arrow.sourceLat
                        : arrow.lat1,
                    NaN
                );

            const sourceLon =
                finite(
                    arrow.sourceLon !== undefined
                        ? arrow.sourceLon
                        : arrow.lon1,
                    NaN
                );

            const targetLat =
                finite(
                    arrow.targetLat !== undefined
                        ? arrow.targetLat
                        : arrow.lat2,
                    NaN
                );

            const targetLon =
                finite(
                    arrow.targetLon !== undefined
                        ? arrow.targetLon
                        : arrow.lon2,
                    NaN
                );

            if (
                !Number.isFinite(sourceLat) ||
                !Number.isFinite(sourceLon) ||
                !Number.isFinite(targetLat) ||
                !Number.isFinite(targetLon)
            ) {
                continue;
            }

            this._drawSmoothPath(
                this.ctx,
                [
                    {
                        lat: sourceLat,
                        lon: sourceLon
                    },
                    {
                        lat: targetLat,
                        lon: targetLon
                    }
                ],
                {
                    stroke:
                        "rgba(30,28,24,0.34)",

                    width: 1.5,

                    headSize: 8
                }
            );
        }
    }


    _drawCommittedCurves() {
        if (
            !this.options.steeringArrows
        ) {
            return;
        }

        for (
            const curve of this.committedCurves
        ) {
            this._drawSmoothPath(
                this.ctx,
                curve.points,
                {
                    stroke:
                        "rgba(34,27,18,0.94)",

                    width: 3.2,

                    headSize: 13
                }
            );
        }
    }


    _drawDragPreview() {
        if (
            !this.drag.active ||
            this.drag.points.length <
            2
        ) {
            return;
        }

        this._drawSmoothPath(
            this.ctx,
            this.drag.points,
            {
                stroke:
                    "rgba(255,255,255,0.96)",

                width: 3,

                headSize: 13,

                dashed: true
            }
        );
    }


    /* ========================================================================
       SMOOTH VISUAL INTERPOLATION
       ======================================================================== */

    setVisualTransitionMs(milliseconds) {
        this.transitionDuration =
            Math.max(
                0,
                finite(
                    milliseconds,
                    0
                )
            );

        return this;
    }


    _startTransition(fields) {
        /*
         * Current becomes previous.
         */
        this.fieldCtxPrevious.clearRect(
            0,
            0,
            this.width,
            this.height
        );

        this.fieldCtxPrevious.drawImage(
            this.fieldCanvasCurrent,
            0,
            0
        );

        /*
         * Render the new 4-minute physical state.
         */
        this.fieldCtxCurrent.clearRect(
            0,
            0,
            this.width,
            this.height
        );

        this._renderWeatherField(
            this.fieldCtxCurrent,
            fields
        );

        this.transitionStart =
            performance.now();

        this.transitionAnimating =
            this.transitionDuration >
            0;

        this._rebuildIsobars(
            fields
        );

        if (
            this.transitionAnimating
        ) {
            this._scheduleTransitionFrame();
        }
    }


    _scheduleTransitionFrame() {
        if (
            this.animationFrame !==
            null
        ) {
            return;
        }

        this.animationFrame =
            requestAnimationFrame(
                () => {
                    this.animationFrame = null;

                    this._drawComposite();

                    if (
                        this.transitionAnimating
                    ) {
                        this._scheduleTransitionFrame();
                    }
                }
            );
    }


    _drawComposite() {
        const started =
            performance.now();

        const fields =
            this._getFields();

        const ctx =
            this.ctx;

        ctx.clearRect(
            0,
            0,
            this.width,
            this.height
        );

        let blend = 1;

        if (
            this.transitionAnimating
        ) {
            blend =
                U.clamp(
                    (
                        performance.now() -
                        this.transitionStart
                    ) /
                    Math.max(
                        1,
                        this.transitionDuration
                    ),
                    0,
                    1
                );

            /*
             * Ease in/out instead of linear flickering.
             */
            blend =
                blend *
                blend *
                (
                    3 -
                    2 *
                    blend
                );

            if (
                blend >=
                0.999
            ) {
                blend = 1;

                this.transitionAnimating =
                    false;
            }
        }

        if (
            blend < 1
        ) {
            ctx.globalAlpha =
                1 -
                blend;

            ctx.drawImage(
                this.fieldCanvasPrevious,
                0,
                0
            );

            ctx.globalAlpha =
                blend;

            ctx.drawImage(
                this.fieldCanvasCurrent,
                0,
                0
            );

            ctx.globalAlpha = 1;
        } else {
            ctx.drawImage(
                this.fieldCanvasCurrent,
                0,
                0
            );
        }

        /*
         * Cached geography.
         */
        ctx.drawImage(
            this.geographyCanvas,
            0,
            0
        );

        /*
         * Cached isobars.
         */
        if (
            this.options.isobars
        ) {
            ctx.drawImage(
                this.isobarCanvas,
                0,
                0
            );
        }

        this._drawWindVectors(
            fields
        );

        this._drawSystems();

        this._drawExistingStraightArrows();

        this._drawCommittedCurves();

        this._drawDragPreview();

        this.lastRenderMs =
            performance.now() -
            started;
    }


    /* ========================================================================
       MAIN RENDER
       ======================================================================== */

    render(force = false) {
        const fields =
            this._getFields();

        let weatherTime;

        try {
            weatherTime =
                this.weather.getTimeMs();
        } catch (error) {
            weatherTime =
                Date.now();
        }

        const changed =
            force ||
            this.lastWeatherTime ===
            null ||
            weatherTime !==
            this.lastWeatherTime;

        if (changed) {
            if (
                this.lastWeatherTime ===
                null ||
                force
            ) {
                this.fieldCtxCurrent.clearRect(
                    0,
                    0,
                    this.width,
                    this.height
                );

                this._renderWeatherField(
                    this.fieldCtxCurrent,
                    fields
                );

                this.fieldCtxPrevious.clearRect(
                    0,
                    0,
                    this.width,
                    this.height
                );

                this.fieldCtxPrevious.drawImage(
                    this.fieldCanvasCurrent,
                    0,
                    0
                );

                this._rebuildIsobars(
                    fields
                );

                this.transitionAnimating =
                    false;
            } else {
                this._startTransition(
                    fields
                );
            }

            this.lastWeatherTime =
                weatherTime;
        }

        if (this.geographyDirty) {
            this.rebuildGeography();
        }

        this._drawComposite();

        return this;
    }


    /* ========================================================================
       PUBLIC CONTROL API
       ======================================================================== */

    setLayer(layer) {
        this.layer = layer;
        this.options.layer = layer;

        /*
         * Changing layer is not a meteorological timestep,
         * so render it immediately rather than crossfading from another
         * variable.
         */
        const fields =
            this._getFields();

        this.fieldCtxCurrent.clearRect(
            0,
            0,
            this.width,
            this.height
        );

        this._renderWeatherField(
            this.fieldCtxCurrent,
            fields
        );

        this.fieldCtxPrevious.clearRect(
            0,
            0,
            this.width,
            this.height
        );

        this.fieldCtxPrevious.drawImage(
            this.fieldCanvasCurrent,
            0,
            0
        );

        this.transitionAnimating =
            false;

        this._drawComposite();

        return this;
    }


    setIsobars(enabled) {
        this.options.isobars =
            !!enabled;

        this._rebuildIsobars(
            this._getFields()
        );

        this._drawComposite();

        return this;
    }


    setWindVectors(enabled) {
        this.options.windVectors =
            !!enabled;

        this._drawComposite();

        return this;
    }


    setFrontOverlay(enabled) {
        this.options.frontOverlay =
            !!enabled;

        this._drawComposite();

        return this;
    }


    setSystemMarkers(enabled) {
        this.options.systemMarkers =
            !!enabled;

        this._drawComposite();

        return this;
    }


    setSteeringArrows(enabled) {
        this.options.steeringArrows =
            !!enabled;

        this._drawComposite();

        return this;
    }


    setCoastline(enabled) {
        this.options.coastline =
            !!enabled;

        this.geographyDirty = true;

        this.rebuildGeography();

        this._drawComposite();

        return this;
    }


    setLandShading(enabled) {
        this.options.landShading =
            !!enabled;

        this.geographyDirty = true;

        this.rebuildGeography();

        this._drawComposite();

        return this;
    }


    setDragToolEnabled(enabled) {
        this.options.dragToolEnabled =
            !!enabled;

        this.canvas.style.cursor =
            enabled
                ? "crosshair"
                : "default";

        if (!enabled) {
            this.drag.active = false;
            this.drag.points = [];
        }

        this._drawComposite();

        return this;
    }


    resize(width, height) {
        this.width =
            Math.max(
                1,
                Math.floor(width)
            );

        this.height =
            Math.max(
                1,
                Math.floor(height)
            );

        this.canvas.width =
            this.width;

        this.canvas.height =
            this.height;

        this.fieldCanvasPrevious.width =
            this.width;

        this.fieldCanvasPrevious.height =
            this.height;

        this.fieldCanvasCurrent.width =
            this.width;

        this.fieldCanvasCurrent.height =
            this.height;

        this.geographyCanvas.width =
            this.width;

        this.geographyCanvas.height =
            this.height;

        this.isobarCanvas.width =
            this.width;

        this.isobarCanvas.height =
            this.height;

        this.fieldCtxPrevious =
            this.fieldCanvasPrevious.getContext("2d");

        this.fieldCtxCurrent =
            this.fieldCanvasCurrent.getContext("2d");

        this.geographyCtx =
            this.geographyCanvas.getContext("2d");

        this.isobarCtx =
            this.isobarCanvas.getContext("2d");

        this._imageData =
            this.fieldCtxCurrent.createImageData(
                this.width,
                this.height
            );

        this._displayX =
            new Float32Array(
                this.width
            );

        this._displayY =
            new Float32Array(
                this.height
            );

        this._buildLookup();

        this.geographyDirty = true;

        this.lastWeatherTime = null;

        this.rebuildGeography();

        this.render(true);

        return this;
    }


    getInfo() {
        return {
            width:
                this.width,

            height:
                this.height,

            layer:
                this.layer,

            lastRenderMs:
                this.lastRenderMs,

            coastline:
                !!this.options.coastline,

            landShading:
                !!this.options.landShading,

            dragToolEnabled:
                !!this.options.dragToolEnabled,

            committedCurves:
                this.committedCurves.length,

            transitionMs:
                this.transitionDuration
        };
    }


    destroy() {
        if (
            this.animationFrame !==
            null
        ) {
            cancelAnimationFrame(
                this.animationFrame
            );

            this.animationFrame = null;
        }

        this.canvas.removeEventListener(
            "pointerdown",
            this._pointerDown
        );

        this.canvas.removeEventListener(
            "pointermove",
            this._pointerMove
        );

        this.canvas.removeEventListener(
            "pointerup",
            this._pointerUp
        );

        this.canvas.removeEventListener(
            "pointercancel",
            this._pointerCancel
        );
    }
}


/* ============================================================================
   EXPORT
============================================================================ */

global.EuropaRenderer =
    EuropaRenderer;

global.EuropaRendererDefaults =
    DEFAULTS;

global.EuropaRendererColourScales =
    COLOUR_SCALES;

})(window);
