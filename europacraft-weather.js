"use strict";

(function () {

  const BOUNDS = {
    north: 74,
    south: 30,
    west: -26,
    east: 52
  };


  /*
      Static geography only.

      These are NOT weather APIs.

      Natural Earth supplies the real coastline/land mask.

      AWS Terrarium supplies real elevation at a deliberately coarse
      zoom appropriate for a continental weather planner.
  */

  const GEO_URL =
    "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@ca96624a/geojson/ne_50m_land.geojson";


  const TERRAIN_URL =
    "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";


  /*
      Zoom 4 is intentionally coarse.

      At continental scale this is enough to represent:
      - Alps
      - Pyrenees
      - Carpathians
      - Scandinavian mountains
      - Scottish Highlands
      - Balkan mountains
      - major lowlands

      without turning the browser into a terrain-processing project.
  */
  const TERRAIN_ZOOM =
    4;


  const KM_PER_DEG =
    111.32;


  const MS_HOUR =
    3600000;


  const MS_DAY =
    86400000;


  const STORAGE_KEY =
    "europacraft-weather-studio-v1";


  const DEFAULT_PLAN = {

    version:
      1,

    blockStart:
      "2026-10-01T00:00:00Z",

    blockEnd:
      "2026-12-31T23:59:59Z",

    lockedHistoryHours:
      12,

    doneThrough:
      null,

    lockedThrough:
      null,

    objects:
      []

  };


  let plan =
    loadPlan() ||
    structuredCloneSafe(
      DEFAULT_PLAN
    );


  const canvas =
    document.getElementById(
      "map"
    );


  const ctx =
    canvas.getContext(
      "2d"
    );


  const ui = {

    currentTime:
      document.getElementById(
        "currentTime"
      ),

    planRange:
      document.getElementById(
        "planRange"
      ),

    planState:
      document.getElementById(
        "planState"
      ),

    mapHint:
      document.getElementById(
        "mapHint"
      ),

    coords:
      document.getElementById(
        "coords"
      ),

    layer:
      document.getElementById(
        "layer"
      ),

    finishAir:
      document.getElementById(
        "finishAir"
      ),

    cancelAir:
      document.getElementById(
        "cancelAir"
      ),

    airType:
      document.getElementById(
        "airType"
      ),

    airIntensity:
      document.getElementById(
        "airIntensity"
      ),

    airWidth:
      document.getElementById(
        "airWidth"
      ),

    airDuration:
      document.getElementById(
        "airDuration"
      ),

    pressureStrength:
      document.getElementById(
        "pressureStrength"
      ),

    pressureDuration:
      document.getElementById(
        "pressureDuration"
      ),

    timeSlider:
      document.getElementById(
        "timeSlider"
      ),

    timeInput:
      document.getElementById(
        "timeInput"
      ),

    timeStart:
      document.getElementById(
        "timeStart"
      ),

    timeMiddle:
      document.getElementById(
        "timeMiddle"
      ),

    timeEnd:
      document.getElementById(
        "timeEnd"
      ),

    m6:
      document.getElementById(
        "m6"
      ),

    m1:
      document.getElementById(
        "m1"
      ),

    p1:
      document.getElementById(
        "p1"
      ),

    p6:
      document.getElementById(
        "p6"
      ),

    where:
      document.getElementById(
        "where"
      ),

    wxTemp:
      document.getElementById(
        "wxTemp"
      ),

    wxAnom:
      document.getElementById(
        "wxAnom"
      ),

    wxPressure:
      document.getElementById(
        "wxPressure"
      ),

    wxWind:
      document.getElementById(
        "wxWind"
      ),

    wxCloud:
      document.getElementById(
        "wxCloud"
      ),

    wxMoisture:
      document.getElementById(
        "wxMoisture"
      ),

    wxPrecip:
      document.getElementById(
        "wxPrecip"
      ),

    wxSnow:
      document.getElementById(
        "wxSnow"
      ),

    wxElevation:
      document.getElementById(
        "wxElevation"
      ),

    objects:
      document.getElementById(
        "objects"
      ),

    deleteSelected:
      document.getElementById(
        "deleteSelected"
      ),

    markDone:
      document.getElementById(
        "markDone"
      ),

    lockThrough:
      document.getElementById(
        "lockThrough"
      ),

    nextBlock:
      document.getElementById(
        "nextBlock"
      ),

    save:
      document.getElementById(
        "save"
      ),

    export:
      document.getElementById(
        "export"
      ),

    reset:
      document.getElementById(
        "reset"
      ),

    message:
      document.getElementById(
        "message"
      )

  };


  const state = {

    tool:
      "inspect",

    layer:
      "synoptic",

    now:
      Date.parse(
        plan.blockStart
      ),

    displayStart:
      0,

    displayEnd:
      0,

    selectedId:
      null,

    inspect: {
      lat: 53.5,
      lon: 15
    },

    drawPath:
      [],

    drawActive:
      false,

    width:
      900,

    height:
      520,

    dpr:
      1,

    geoReady:
      false,

    terrainReady:
      false,

    terrainLoading:
      false,

    landMask:
      null,

    baseCanvas:
      document.createElement(
        "canvas"
      ),

    terrainTiles:
      new Map(),

    overlayCache:
      new Map()

  };


  const MASK_W =
    780;


  const MASK_H =
    440;


  const landCanvas =
    document.createElement(
      "canvas"
    );


  landCanvas.width =
    MASK_W;


  landCanvas.height =
    MASK_H;


  const landCtx =
    landCanvas.getContext(
      "2d",
      {
        willReadFrequently:
          true
      }
    );


  /*
      ==========================================================
      GENERIC HELPERS
      ==========================================================
  */


  function structuredCloneSafe(
    value
  ) {

    return JSON.parse(
      JSON.stringify(
        value
      )
    );

  }


  function clamp(
    v,
    min,
    max
  ) {

    v =
      Number(v);


    if (
      !Number.isFinite(
        v
      )
    ) {

      return min;

    }


    return Math.max(
      min,
      Math.min(
        max,
        v
      )
    );

  }


  function lerp(
    a,
    b,
    t
  ) {

    return (
      a +
      (
        b -
        a
      ) *
      t
    );

  }


  function smoothstep(
    t
  ) {

    t =
      clamp(
        t,
        0,
        1
      );


    return (
      t *
      t *
      (
        3 -
        2 *
        t
      )
    );

  }


  function degToRad(
    d
  ) {

    return (
      d *
      Math.PI /
      180
    );

  }


  function radToDeg(
    r
  ) {

    return (
      r *
      180 /
      Math.PI
    );

  }


  function normDeg(
    d
  ) {

    d %=
      360;


    if (
      d <
      0
    ) {

      d +=
        360;

    }


    return d;

  }


  function pad2(
    n
  ) {

    return String(
      n
    )
    .padStart(
      2,
      "0"
    );

  }


  function monthName(
    i
  ) {

    return [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec"
    ][i];

  }


  function formatUTC(
    ms
  ) {

    const d =
      new Date(
        ms
      );


    return (
      d.getUTCFullYear() +
      "-" +
      pad2(
        d.getUTCMonth() +
        1
      ) +
      "-" +
      pad2(
        d.getUTCDate()
      ) +
      " " +
      pad2(
        d.getUTCHours()
      ) +
      ":" +
      pad2(
        d.getUTCMinutes()
      ) +
      " UTC"
    );

  }


  function shortUTC(
    ms
  ) {

    const d =
      new Date(
        ms
      );


    return (
      pad2(
        d.getUTCDate()
      ) +
      " " +
      monthName(
        d.getUTCMonth()
      ) +
      " " +
      pad2(
        d.getUTCHours()
      ) +
      ":" +
      pad2(
        d.getUTCMinutes()
      )
    );

  }


  function toLocalInput(
    ms
  ) {

    const d =
      new Date(
        ms
      );


    return (
      d.getUTCFullYear() +
      "-" +
      pad2(
        d.getUTCMonth() +
        1
      ) +
      "-" +
      pad2(
        d.getUTCDate()
      ) +
      "T" +
      pad2(
        d.getUTCHours()
      ) +
      ":" +
      pad2(
        d.getUTCMinutes()
      )
    );

  }


  function parseLocalInputAsUTC(
    text
  ) {

    const m =
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
      .exec(
        text ||
        ""
      );


    if (!m) {

      return NaN;

    }


    return Date.UTC(
      +m[1],
      +m[2] -
      1,
      +m[3],
      +m[4],
      +m[5]
    );

  }


  function dayOfYear(
    ms
  ) {

    const d =
      new Date(
        ms
      );


    return (
      Math.floor(
        (
          ms -
          Date.UTC(
            d.getUTCFullYear(),
            0,
            1
          )
        ) /
        MS_DAY
      ) +
      1
    );

  }


  function msg(
    text,
    lead =
      ""
  ) {

    ui.message.textContent =
      lead
        ? lead +
          " " +
          text
        : text;

  }


  /*
      ==========================================================
      MAP PROJECTION
      ==========================================================
  */


  function lonToX(
    lon,
    width =
      state.width
  ) {

    return (
      (
        lon -
        BOUNDS.west
      ) /
      (
        BOUNDS.east -
        BOUNDS.west
      ) *
      width
    );

  }


  function latToY(
    lat,
    height =
      state.height
  ) {

    return (
      (
        BOUNDS.north -
        lat
      ) /
      (
        BOUNDS.north -
        BOUNDS.south
      ) *
      height
    );

  }


  function xToLon(
    x,
    width =
      state.width
  ) {

    return (
      BOUNDS.west +
      x /
      width *
      (
        BOUNDS.east -
        BOUNDS.west
      )
    );

  }


  function yToLat(
    y,
    height =
      state.height
  ) {

    return (
      BOUNDS.north -
      y /
      height *
      (
        BOUNDS.north -
        BOUNDS.south
      )
    );

  }


  function canvasPoint(
    evt
  ) {

    const r =
      canvas.getBoundingClientRect();


    return {

      x:
        (
          evt.clientX -
          r.left
        ) *
        state.width /
        r.width,

      y:
        (
          evt.clientY -
          r.top
        ) *
        state.height /
        r.height

    };

  }


  function kmPerLonDeg(
    lat
  ) {

    return (
      KM_PER_DEG *
      Math.max(
        0.12,
        Math.cos(
          degToRad(
            lat
          )
        )
      )
    );

  }


  function distanceKm(
    aLat,
    aLon,
    bLat,
    bLon
  ) {

    const ml =
      (
        aLat +
        bLat
      ) /
      2;


    const dx =
      (
        bLon -
        aLon
      ) *
      kmPerLonDeg(
        ml
      );


    const dy =
      (
        bLat -
        aLat
      ) *
      KM_PER_DEG;


    return Math.hypot(
      dx,
      dy
    );

  }


  function localVectorKm(
    aLat,
    aLon,
    bLat,
    bLon
  ) {

    const ml =
      (
        aLat +
        bLat
      ) /
      2;


    return {

      x:
        (
          bLon -
          aLon
        ) *
        kmPerLonDeg(
          ml
        ),

      y:
        (
          bLat -
          aLat
        ) *
        KM_PER_DEG

    };

  }


  function uid(
    prefix
  ) {

    return (
      prefix +
      "_" +
      Date.now()
        .toString(
          36
        ) +
      "_" +
      Math.random()
        .toString(
          36
        )
        .slice(
          2,
          7
        )
    );

  }


  /*
      ==========================================================
      PLAN SAVE / LOAD
      ==========================================================
  */


  function loadPlan() {

    try {

      const raw =
        localStorage.getItem(
          STORAGE_KEY
        );


      if (!raw) {

        return null;

      }


      const p =
        JSON.parse(
          raw
        );


      if (
        !p ||
        !Array.isArray(
          p.objects
        ) ||
        !p.blockStart ||
        !p.blockEnd
      ) {

        return null;

      }


      return p;

    }
    catch (_) {

      return null;

    }

  }


  function savePlan() {

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        plan
      )
    );


    msg(
      "Working plan saved locally."
    );

  }


  function savePlanSilently() {

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        plan
      )
    );

  }


  /*
      ==========================================================
      LOCKING
      ==========================================================
  */


  function isLocked(
    ms
  ) {

    if (
      !plan.lockedThrough
    ) {

      return false;

    }


    return (
      ms <=
      Date.parse(
        plan.lockedThrough
      )
    );

  }


  function objectFrozen(
    obj
  ) {

    if (
      !plan.lockedThrough
    ) {

      return false;

    }


    return (
      Date.parse(
        obj.startTime
      ) <=
      Date.parse(
        plan.lockedThrough
      )
    );

  }


  function planningState(
    ms =
      state.now
  ) {

    if (
      plan.lockedThrough &&
      ms <=
      Date.parse(
        plan.lockedThrough
      )
    ) {

      return "LOCKED";

    }


    if (
      plan.doneThrough &&
      ms <=
      Date.parse(
        plan.doneThrough
      )
    ) {

      return "DONE";

    }


    return "NOT DONE";

  }


  /*
      ==========================================================
      TIMELINE
      ==========================================================
  */


  function rebuildTimeline() {

    const start =
      Date.parse(
        plan.blockStart
      );


    const end =
      Date.parse(
        plan.blockEnd
      );


    let displayStart =
      start;


    /*
        When moving into a later planning block, expose the
        final 12 hours of already-locked history.
    */

    if (
      plan.lockedThrough
    ) {

      const locked =
        Date.parse(
          plan.lockedThrough
        );


      if (
        locked <
        start
      ) {

        displayStart =
          locked -
          plan.lockedHistoryHours *
          MS_HOUR;

      }

    }


    state.displayStart =
      displayStart;


    state.displayEnd =
      end;


    state.now =
      clamp(
        state.now,
        displayStart,
        end
      );


    ui.timeStart.textContent =
      shortUTC(
        displayStart
      );


    ui.timeEnd.textContent =
      shortUTC(
        end
      );


    syncTimeControls();

  }


  function syncTimeControls() {

    const f =
      (
        state.now -
        state.displayStart
      ) /
      Math.max(
        1,
        state.displayEnd -
        state.displayStart
      );


    ui.timeSlider.value =
      String(
        clamp(
          f *
          2000,
          0,
          2000
        )
      );


    ui.timeInput.value =
      toLocalInput(
        state.now
      );

  }


  function setTime(
    ms
  ) {

    state.now =
      clamp(
        ms,
        state.displayStart,
        state.displayEnd
      );


    state.overlayCache.clear();


    syncTimeControls();

    updateTop();

    updateObjects();

    updateInspect();

    render();

  }


  function updateTop() {

    ui.currentTime.textContent =
      formatUTC(
        state.now
      );


    ui.planRange.textContent =
      shortUTC(
        Date.parse(
          plan.blockStart
        )
      ) +
      " → " +
      shortUTC(
        Date.parse(
          plan.blockEnd
        )
      );


    const s =
      planningState();


    ui.planState.textContent =
      s;


    ui.timeMiddle.textContent =
      s ===
      "LOCKED"
        ? "LOCKED · view only"
        : s ===
          "DONE"
          ? "DONE · reviewed, still editable"
          : "NOT DONE · editable";

  }


  /*
      ==========================================================
      REAL GEOGRAPHY
      ==========================================================
  */


  async function loadGeography() {

    try {

      msg(
        "Loading Natural Earth coastline…"
      );


      const res =
        await fetch(
          GEO_URL,
          {
            cache:
              "force-cache"
          }
        );


      if (
        !res.ok
      ) {

        throw new Error(
          "Natural Earth HTTP " +
          res.status
        );

      }


      const geo =
        await res.json();


      buildLandMask(
        geo
      );


      state.geoReady =
        true;


      buildBaseMap();

      render();


      msg(
        "Real coastline loaded. Loading terrain elevation…"
      );


      await loadTerrainTiles();


      buildBaseMap();

      render();

      updateInspect();


      msg(
        "Ready. Draw an air path, place a high or low, then use the overlays to see what develops."
      );

    }
    catch (
      err
    ) {

      console.error(
        err
      );


      msg(
        "Could not load real geography. The planner will not substitute fake Europe.",
        "DATA ERROR:"
      );


      ui.mapHint.textContent =
        "REAL GEOGRAPHY COULD NOT LOAD — check internet/static dataset access.";


      render();

    }

  }


  function buildLandMask(
    geo
  ) {

    landCtx.clearRect(
      0,
      0,
      MASK_W,
      MASK_H
    );


    landCtx.fillStyle =
      "#fff";


    landCtx.beginPath();


    function ringPath(
      ring
    ) {

      if (
        !ring ||
        ring.length <
        2
      ) {

        return;

      }


      const p0 =
        ring[0];


      landCtx.moveTo(
        lonToX(
          p0[0],
          MASK_W
        ),
        latToY(
          p0[1],
          MASK_H
        )
      );


      for (
        let i = 1;
        i <
        ring.length;
        i++
      ) {

        landCtx.lineTo(
          lonToX(
            ring[i][0],
            MASK_W
          ),
          latToY(
            ring[i][1],
            MASK_H
          )
        );

      }


      landCtx.closePath();

    }


    for (
      const feature of
      geo.features ||
      []
    ) {

      const g =
        feature.geometry;


      if (!g) {

        continue;

      }


      if (
        g.type ===
        "Polygon"
      ) {

        for (
          const ring of
          g.coordinates
        ) {

          ringPath(
            ring
          );

        }

      }
      else if (
        g.type ===
        "MultiPolygon"
      ) {

        for (
          const poly of
          g.coordinates
        ) {

          for (
            const ring of
            poly
          ) {

            ringPath(
              ring
            );

          }

        }

      }

    }


    landCtx.fill(
      "evenodd"
    );


    state.landMask =
      landCtx.getImageData(
        0,
        0,
        MASK_W,
        MASK_H
      ).data;

  }


  function isLand(
    lat,
    lon
  ) {

    if (
      !state.geoReady ||
      !state.landMask
    ) {

      return false;

    }


    const x =
      clamp(
        Math.floor(
          (
            lon -
            BOUNDS.west
          ) /
          (
            BOUNDS.east -
            BOUNDS.west
          ) *
          MASK_W
        ),
        0,
        MASK_W -
        1
      );


    const y =
      clamp(
        Math.floor(
          (
            BOUNDS.north -
            lat
          ) /
          (
            BOUNDS.north -
            BOUNDS.south
          ) *
          MASK_H
        ),
        0,
        MASK_H -
        1
      );


    return (
      state.landMask[
        (
          y *
          MASK_W +
          x
        ) *
        4 +
        3
      ] >
      0
    );

  }


  /*
      ==========================================================
      REAL ELEVATION
      AWS TERRARIUM
      ==========================================================
  */


  function mercatorTileXY(
    lat,
    lon,
    z
  ) {

    const n =
      2 **
      z;


    const latRad =
      degToRad(
        clamp(
          lat,
          -85.0511,
          85.0511
        )
      );


    const xf =
      (
        lon +
        180
      ) /
      360 *
      n;


    const yf =
      (
        1 -
        Math.asinh(
          Math.tan(
            latRad
          )
        ) /
        Math.PI
      ) /
      2 *
      n;


    return {

      xf:
        xf,

      yf:
        yf,

      x:
        Math.floor(
          xf
        ),

      y:
        Math.floor(
          yf
        )

    };

  }


  async function imageDataFromBlob(
    blob
  ) {

    if (
      "createImageBitmap" in
      window
    ) {

      const bmp =
        await createImageBitmap(
          blob
        );


      const c =
        document.createElement(
          "canvas"
        );


      c.width =
        bmp.width;


      c.height =
        bmp.height;


      const cctx =
        c.getContext(
          "2d",
          {
            willReadFrequently:
              true
          }
        );


      cctx.drawImage(
        bmp,
        0,
        0
      );


      if (
        bmp.close
      ) {

        bmp.close();

      }


      return cctx.getImageData(
        0,
        0,
        c.width,
        c.height
      );

    }


    return await new Promise(
      (
        resolve,
        reject
      ) => {

        const url =
          URL.createObjectURL(
            blob
          );


        const img =
          new Image();


        img.onload =
          () => {

            const c =
              document.createElement(
                "canvas"
              );


            c.width =
              img.naturalWidth;


            c.height =
              img.naturalHeight;


            const cctx =
              c.getContext(
                "2d",
                {
                  willReadFrequently:
                    true
                }
              );


            cctx.drawImage(
              img,
              0,
              0
            );


            URL.revokeObjectURL(
              url
            );


            resolve(
              cctx.getImageData(
                0,
                0,
                c.width,
                c.height
              )
            );

          };


        img.onerror =
          reject;


        img.src =
          url;

      }
    );

  }


  async function loadTerrainTile(
    z,
    x,
    y
  ) {

    const key =
      z +
      "/" +
      x +
      "/" +
      y;


    if (
      state.terrainTiles.has(
        key
      )
    ) {

      return;

    }


    const url =
      TERRAIN_URL
        .replace(
          "{z}",
          z
        )
        .replace(
          "{x}",
          x
        )
        .replace(
          "{y}",
          y
        );


    const res =
      await fetch(
        url,
        {
          cache:
            "force-cache"
        }
      );


    if (
      !res.ok
    ) {

      throw new Error(
        "Terrain " +
        key +
        ": HTTP " +
        res.status
      );

    }


    const imageData =
      await imageDataFromBlob(
        await res.blob()
      );


    state.terrainTiles.set(
      key,
      imageData
    );

  }


  async function loadTerrainTiles() {

    if (
      state.terrainLoading
    ) {

      return;

    }


    state.terrainLoading =
      true;


    const nw =
      mercatorTileXY(
        BOUNDS.north,
        BOUNDS.west,
        TERRAIN_ZOOM
      );


    const se =
      mercatorTileXY(
        BOUNDS.south,
        BOUNDS.east,
        TERRAIN_ZOOM
      );


    const jobs =
      [];


    for (
      let x = nw.x;
      x <=
      se.x;
      x++
    ) {

      for (
        let y = nw.y;
        y <=
        se.y;
        y++
      ) {

        jobs.push(
          loadTerrainTile(
            TERRAIN_ZOOM,
            x,
            y
          )
        );

      }

    }


    const results =
      await Promise.allSettled(
        jobs
      );


    const ok =
      results.filter(
        result =>
          result.status ===
          "fulfilled"
      ).length;


    state.terrainReady =
      ok >
      0;


    state.terrainLoading =
      false;


    if (
      ok !==
      results.length
    ) {

      console.warn(
        "Terrain tiles loaded " +
        ok +
        "/" +
        results.length
      );

    }

  }


  function elevationAt(
    lat,
    lon
  ) {

    if (
      !state.terrainReady
    ) {

      return 0;

    }


    const t =
      mercatorTileXY(
        lat,
        lon,
        TERRAIN_ZOOM
      );


    const data =
      state.terrainTiles.get(
        TERRAIN_ZOOM +
        "/" +
        t.x +
        "/" +
        t.y
      );


    if (!data) {

      return 0;

    }


    const px =
      clamp(
        Math.floor(
          (
            t.xf -
            t.x
          ) *
          data.width
        ),
        0,
        data.width -
        1
      );


    const py =
      clamp(
        Math.floor(
          (
            t.yf -
            t.y
          ) *
          data.height
        ),
        0,
        data.height -
        1
      );


    const i =
      (
        py *
        data.width +
        px
      ) *
      4;


    const r =
      data.data[i];


    const g =
      data.data[
        i +
        1
      ];


    const b =
      data.data[
        i +
        2
      ];


    /*
        Terrarium encoding:

        elevation =
            R * 256
            + G
            + B / 256
            - 32768
    */

    const h =
      r *
      256 +
      g +
      b /
      256 -
      32768;


    return (
      isLand(
        lat,
        lon
      )
        ? h
        : 0
    );

  }


  /*
      ==========================================================
      BASE MAP
      ==========================================================
  */


  function buildBaseMap() {

    const W =
      MASK_W;


    const H =
      MASK_H;


    state.baseCanvas.width =
      W;


    state.baseCanvas.height =
      H;


    const bctx =
      state.baseCanvas.getContext(
        "2d"
      );


    const img =
      bctx.createImageData(
        W,
        H
      );


    for (
      let y = 0;
      y <
      H;
      y++
    ) {

      const lat =
        yToLat(
          y +
          0.5,
          H
        );


      for (
        let x = 0;
        x <
        W;
        x++
      ) {

        const lon =
          xToLon(
            x +
            0.5,
            W
          );


        const land =
          isLand(
            lat,
            lon
          );


        const i =
          (
            y *
            W +
            x
          ) *
          4;


        let r;
        let g;
        let b;


        if (!land) {

          r =
            19;

          g =
            48;

          b =
            66;

        }
        else {

          const h =
            state.terrainReady
              ? Math.max(
                  -50,
                  elevationAt(
                    lat,
                    lon
                  )
                )
              : 0;


          if (
            h <
            150
          ) {

            r =
              68;

            g =
              94;

            b =
              61;

          }
          else if (
            h <
            600
          ) {

            const t =
              (
                h -
                150
              ) /
              450;


            r =
              lerp(
                68,
                111,
                t
              );

            g =
              lerp(
                94,
                104,
                t
              );

            b =
              lerp(
                61,
                68,
                t
              );

          }
          else if (
            h <
            1500
          ) {

            const t =
              (
                h -
                600
              ) /
              900;


            r =
              lerp(
                111,
                142,
                t
              );

            g =
              lerp(
                104,
                127,
                t
              );

            b =
              lerp(
                68,
                98,
                t
              );

          }
          else if (
            h <
            2800
          ) {

            const t =
              (
                h -
                1500
              ) /
              1300;


            r =
              lerp(
                142,
                177,
                t
              );

            g =
              lerp(
                127,
                162,
                t
              );

            b =
              lerp(
                98,
                140,
                t
              );

          }
          else {

            const t =
              clamp(
                (
                  h -
                  2800
                ) /
                1800,
                0,
                1
              );


            r =
              lerp(
                177,
                232,
                t
              );

            g =
              lerp(
                162,
                229,
                t
              );

            b =
              lerp(
                140,
                225,
                t
              );

          }

        }


        img.data[i] =
          Math.round(
            r
          );


        img.data[
          i +
          1
        ] =
          Math.round(
            g
          );


        img.data[
          i +
          2
        ] =
          Math.round(
            b
          );


        img.data[
          i +
          3
        ] =
          255;

      }

    }


    bctx.putImageData(
      img,
      0,
      0
    );

  }


  /*
      ==========================================================
      CLIMATOLOGICAL BASELINE
      ==========================================================
  */


  function baselineTempNoElevation(
    lat,
    lon,
    ms
  ) {

    const land =
      isLand(
        lat,
        lon
      );


    const doy =
      dayOfYear(
        ms
      );


    let annual =
      17.5 -
      0.46 *
      (
        lat -
        35
      );


    if (!land) {

      annual +=
        0.7;

    }


    if (
      land &&
      lon <
      2 &&
      lat >
      48
    ) {

      annual +=
        1.2;

    }


    if (
      land &&
      lat <
      45
    ) {

      annual +=
        1.2;

    }


    const cont =
      land
        ? clamp(
            (
              lon +
              5
            ) /
            38,
            0.08,
            0.95
          ) *
          (
            lon <
            3 &&
            lat >
            48
              ? 0.5
              : 1
          )
        : 0.05;


    const amp =
      land
        ? (
            6.0 +
            cont *
            8.0 +
            Math.max(
              0,
              lat -
              48
            ) *
            0.06
          )
        : 5.0;


    const seasonal =
      amp *
      Math.cos(
        2 *
        Math.PI *
        (
          doy -
          200
        ) /
        365.2422
      );


    const d =
      new Date(
        ms
      );


    let solarHour =
      d.getUTCHours() +
      d.getUTCMinutes() /
      60 +
      lon /
      15;


    solarHour =
      (
        (
          solarHour %
          24
        ) +
        24
      ) %
      24;


    const diurnalAmp =
      land
        ? (
            1.7 +
            cont *
            2.5
          )
        : 0.6;


    const diurnal =
      diurnalAmp *
      Math.cos(
        2 *
        Math.PI *
        (
          solarHour -
          15
        ) /
        24
      );


    return (
      annual +
      seasonal +
      diurnal
    );

  }


  function baselineTemp(
    lat,
    lon,
    ms
  ) {

    return (
      baselineTempNoElevation(
        lat,
        lon,
        ms
      ) -
      Math.max(
        0,
        elevationAt(
          lat,
          lon
        )
      ) /
      1000 *
      6.2
    );

  }


  function baselinePressure(
    lat,
    ms
  ) {

    const winter =
      (
        1 +
        Math.cos(
          2 *
          Math.PI *
          (
            dayOfYear(
              ms
            ) -
            15
          ) /
          365.2422
        )
      ) /
      2;


    return (
      1015.5 -
      clamp(
        (
          lat -
          45
        ) /
        25,
        0,
        1
      ) *
      winter *
      3.2
    );

  }


  function baselineCloud(
    lat,
    lon,
    ms
  ) {

    const winter =
      (
        1 +
        Math.cos(
          2 *
          Math.PI *
          (
            dayOfYear(
              ms
            ) -
            15
          ) /
          365.2422
        )
      ) /
      2;


    let cloud =
      42 +
      17 *
      winter;


    if (
      !isLand(
        lat,
        lon
      )
    ) {

      cloud +=
        8;

    }


    if (
      lon <
      2 &&
      lat >
      48
    ) {

      cloud +=
        8;

    }


    if (
      lat <
      45 &&
      lon >
      -8
    ) {

      cloud -=
        14;

    }


    return clamp(
      cloud,
      12,
      88
    );

  }


  function baselineMoisture(
    lat,
    lon,
    ms
  ) {

    let m =
      isLand(
        lat,
        lon
      )
        ? 0.48
        : 0.73;


    const d =
      new Date(
        ms
      );


    const month =
      d.getUTCMonth();


    if (
      lat <
      45 &&
      month >=
      4 &&
      month <=
      8
    ) {

      m -=
        0.08;

    }


    if (
      lon <
      2 &&
      lat >
      48
    ) {

      m +=
        0.05;

    }


    return clamp(
      m,
      0.25,
      0.82
    );

  }


  /*
      ==========================================================
      AIR SOURCES

      User chooses WHAT air is entering Europe.

      They do not paint anomalies manually.
      ==========================================================
  */


  function airBaseAnomaly(
    type,
    ms
  ) {

    const winter =
      (
        1 +
        Math.cos(
          2 *
          Math.PI *
          (
            dayOfYear(
              ms
            ) -
            15
          ) /
          365.2422
        )
      ) /
      2;


    switch (
      type
    ) {

      case "arctic":

        return lerp(
          -5.5,
          -13.0,
          winter
        );


      case "polar_maritime":

        return lerp(
          -2.5,
          -6.0,
          winter
        );


      case "atlantic":

        return lerp(
          -2.0,
          3.0,
          winter
        );


      case "continental":

        return lerp(
          4.5,
          -7.0,
          winter
        );


      case "mediterranean":

        return lerp(
          5.0,
          7.0,
          winter
        );


      case "tropical":

        return lerp(
          9.0,
          11.5,
          winter
        );


      default:

        return 0;

    }

  }


  function airSourceMoisture(
    type
  ) {

    switch (
      type
    ) {

      case "arctic":
        return 0.22;

      case "polar_maritime":
        return 0.62;

      case "atlantic":
        return 0.78;

      case "continental":
        return 0.26;

      case "mediterranean":
        return 0.68;

      case "tropical":
        return 0.32;

      default:
        return 0.5;

    }

  }


  function intensityMultiplier(
    name
  ) {

    return (
      {
        gentle:
          0.72,

        normal:
          1.0,

        strong:
          1.28,

        extreme:
          1.55
      }[name] ||
      1
    );

  }


  function intensityWind(
    name
  ) {

    return (
      {
        gentle:
          6,

        normal:
          9,

        strong:
          13,

        extreme:
          18
      }[name] ||
      9
    );

  }


  function pressureStrength(
    name
  ) {

    return (
      {
        weak:
          9,

        normal:
          18,

        strong:
          28,

        extreme:
          38
      }[name] ||
      18
    );

  }


  /*
      ==========================================================
      CURVED AIR PATHS
      ==========================================================
  */


  function catmull(
    a,
    b,
    c,
    d,
    t
  ) {

    const t2 =
      t *
      t;


    const t3 =
      t2 *
      t;


    return (
      0.5 *
      (
        2 *
        b +

        (
          -a +
          c
        ) *
        t +

        (
          2 *
          a -
          5 *
          b +
          4 *
          c -
          d
        ) *
        t2 +

        (
          -a +
          3 *
          b -
          3 *
          c +
          d
        ) *
        t3
      )
    );

  }


  function pathPosition(
    path,
    u
  ) {

    if (
      !Array.isArray(
        path
      ) ||
      path.length ===
      0
    ) {

      return {
        lat:
          50,

        lon:
          10
      };

    }


    if (
      path.length ===
      1
    ) {

      return {
        lat:
          path[0].lat,

        lon:
          path[0].lon
      };

    }


    u =
      clamp(
        u,
        0,
        1
      );


    const scaled =
      u *
      (
        path.length -
        1
      );


    const i =
      Math.min(
        path.length -
        2,
        Math.floor(
          scaled
        )
      );


    const t =
      scaled -
      i;


    const p0 =
      path[
        Math.max(
          0,
          i -
          1
        )
      ];


    const p1 =
      path[i];


    const p2 =
      path[
        i +
        1
      ];


    const p3 =
      path[
        Math.min(
          path.length -
          1,
          i +
          2
        )
      ];


    return {

      lat:
        catmull(
          p0.lat,
          p1.lat,
          p2.lat,
          p3.lat,
          t
        ),

      lon:
        catmull(
          p0.lon,
          p1.lon,
          p2.lon,
          p3.lon,
          t
        )

    };

  }


  function pathTangent(
    path,
    u
  ) {

    const a =
      pathPosition(
        path,
        clamp(
          u -
          0.008,
          0,
          1
        )
      );


    const b =
      pathPosition(
        path,
        clamp(
          u +
          0.008,
          0,
          1
        )
      );


    const v =
      localVectorKm(
        a.lat,
        a.lon,
        b.lat,
        b.lon
      );


    const l =
      Math.hypot(
        v.x,
        v.y
      ) ||
      1;


    return {

      x:
        v.x /
        l,

      y:
        v.y /
        l

    };

  }


  function active(
    obj,
    ms
  ) {

    const s =
      Date.parse(
        obj.startTime
      );


    const e =
      Date.parse(
        obj.endTime
      );


    return (
      Number.isFinite(
        s
      ) &&
      Number.isFinite(
        e
      ) &&
      ms >=
      s &&
      ms <=
      e
    );

  }


  function progress(
    obj,
    ms
  ) {

    const s =
      Date.parse(
        obj.startTime
      );


    const e =
      Date.parse(
        obj.endTime
      );


    if (
      !Number.isFinite(
        s
      ) ||
      !Number.isFinite(
        e
      ) ||
      e <=
      s
    ) {

      return 0;

    }


    return smoothstep(
      clamp(
        (
          ms -
          s
        ) /
        (
          e -
          s
        ),
        0,
        1
      )
    );

  }


  function radialWeight(
    d,
    radius
  ) {

    const x =
      d /
      Math.max(
        1,
        radius
      );


    if (
      x >=
      1
    ) {

      return 0;

    }


    const t =
      1 -
      x;


    return (
      t *
      t *
      (
        3 -
        2 *
        t
      )
    );

  }


  /*
      Air is not merely a circular blob.

      The recently traversed section of the curved route remains
      influential, making the result feel more like an actual
      stream of air moving into Europe.
  */

  function distanceToRecentPath(
    obj,
    lat,
    lon,
    u
  ) {

    const startU =
      Math.max(
        0,
        u -
        0.22
      );


    const endU =
      Math.min(
        1,
        u +
        0.035
      );


    let best =
      Infinity;


    const samples =
      18;


    for (
      let i = 0;
      i <=
      samples;
      i++
    ) {

      const q =
        pathPosition(
          obj.path,
          lerp(
            startU,
            endU,
            i /
            samples
          )
        );


      best =
        Math.min(
          best,
          distanceKm(
            lat,
            lon,
            q.lat,
            q.lon
          )
        );

    }


    return best;

  }


  /*
      ==========================================================
      SEA MOISTURE PICKUP

      This is one of the core ideas of this version.

      Drag Arctic air:
          Scandinavia
          → Norwegian Sea
          → North Sea
          → Denmark
          → Baltic
          → Poland

      and it becomes progressively more moisture-rich.

      Long continental journeys gradually dry it again.
      ==========================================================
  */


  function moistureAlongPath(
    obj,
    u
  ) {

    let moisture =
      airSourceMoisture(
        obj.airType
      );


    let prev =
      pathPosition(
        obj.path,
        0
      );


    const steps =
      Math.max(
        1,
        Math.round(
          34 *
          u
        )
      );


    for (
      let i = 1;
      i <=
      steps;
      i++
    ) {

      const p =
        pathPosition(
          obj.path,
          u *
          i /
          steps
        );


      const d =
        distanceKm(
          prev.lat,
          prev.lon,
          p.lat,
          p.lon
        );


      if (
        !isLand(
          p.lat,
          p.lon
        )
      ) {

        const pickup =
          1 -
          Math.exp(
            -d /
            260
          );


        moisture =
          lerp(
            moisture,
            0.95,
            pickup
          );

      }
      else {

        const dry =
          1 -
          Math.exp(
            -d /
            850
          );


        moisture =
          lerp(
            moisture,
            0.38,
            dry *
            0.32
          );

      }


      prev =
        p;

    }


    return clamp(
      moisture,
      0.08,
      0.97
    );

  }


  /*
      ==========================================================
      CORE ATMOSPHERIC FIELD

      This calculates the CAUSES.

      Precipitation is not calculated here yet.

      Output includes:
      - temperature
      - anomaly
      - pressure
      - moisture
      - cloud tendency
      - wind
      - broad synoptic lift
      ==========================================================
  */


  function coreField(
    lat,
    lon,
    ms
  ) {

    const baseT =
      baselineTemp(
        lat,
        lon,
        ms
      );


    let temp =
      baseT;


    let pressure =
      baselinePressure(
        lat,
        ms
      );


    let cloud =
      baselineCloud(
        lat,
        lon,
        ms
      );


    let moisture =
      baselineMoisture(
        lat,
        lon,
        ms
      );


    /*
        Gentle climatological westerly background.
    */
    let uWind =
      4.0;


    let vWind =
      0.0;


    let synopticLift =
      0;


    for (
      const obj of
      plan.objects
    ) {

      if (
        !active(
          obj,
          ms
        )
      ) {

        continue;

      }


      /*
          ------------------------------------------------------
          AIR STREAM
          ------------------------------------------------------
      */

      if (
        obj.kind ===
        "air"
      ) {

        const pr =
          progress(
            obj,
            ms
          );


        const head =
          pathPosition(
            obj.path,
            pr
          );


        const dist =
          distanceToRecentPath(
            obj,
            lat,
            lon,
            pr
          );


        const w =
          radialWeight(
            dist,
            obj.widthKm
          );


        if (
          w <=
          0
        ) {

          continue;

        }


        const anomaly =
          airBaseAnomaly(
            obj.airType,
            ms
          ) *
          intensityMultiplier(
            obj.intensity
          );


        const moist =
          moistureAlongPath(
            obj,
            pr
          );


        const tangent =
          pathTangent(
            obj.path,
            pr
          );


        const speed =
          intensityWind(
            obj.intensity
          );


        temp +=
          anomaly *
          w;


        moisture =
          lerp(
            moisture,
            moist,
            w *
            0.88
          );


        cloud +=
          Math.max(
            0,
            moist -
            0.56
          ) *
          42 *
          w;


        uWind +=
          tangent.x *
          speed *
          w;


        vWind +=
          tangent.y *
          speed *
          w;


        /*
            Moist maritime air arriving over land has some
            natural broad ascent / instability.
        */

        if (
          isLand(
            lat,
            lon
          ) &&
          moist >
          0.72
        ) {

          synopticLift +=
            (
              moist -
              0.72
            ) *
            0.8 *
            w;

        }


        const headD =
          distanceKm(
            lat,
            lon,
            head.lat,
            head.lon
          );


        if (
          headD <
          obj.widthKm *
          0.75
        ) {

          synopticLift +=
            0.08 *
            w;

        }

      }


      /*
          ------------------------------------------------------
          HIGH / LOW PRESSURE
          ------------------------------------------------------
      */

      if (
        obj.kind ===
        "high" ||
        obj.kind ===
        "low"
      ) {

        const d =
          distanceKm(
            lat,
            lon,
            obj.lat,
            obj.lon
          );


        const radius =
          obj.radiusKm ||
          900;


        const w =
          radialWeight(
            d,
            radius
          );


        if (
          w <=
          0
        ) {

          continue;

        }


        const amp =
          pressureStrength(
            obj.strength
          ) *
          (
            obj.kind ===
            "high"
              ? 1
              : -1
          );


        pressure +=
          amp *
          w;


        cloud +=
          (
            obj.kind ===
            "high"
              ? -24
              : 28
          ) *
          w;


        synopticLift +=
          (
            obj.kind ===
            "high"
              ? -0.5
              : 0.9
          ) *
          w;


        /*
            Northern Hemisphere pressure circulation.

            Low:
                counter-clockwise.

            High:
                clockwise.
        */

        const vec =
          localVectorKm(
            obj.lat,
            obj.lon,
            lat,
            lon
          );


        const len =
          Math.hypot(
            vec.x,
            vec.y
          ) ||
          1;


        const nx =
          vec.x /
          len;


        const ny =
          vec.y /
          len;


        const tx =
          obj.kind ===
          "low"
            ? -ny
            : ny;


        const ty =
          obj.kind ===
          "low"
            ? nx
            : -nx;


        const speed =
          pressureStrength(
            obj.strength
          ) *
          0.34 *
          w;


        uWind +=
          tx *
          speed;


        vWind +=
          ty *
          speed;

      }

    }


    cloud =
      clamp(
        cloud +

        Math.max(
          0,
          moisture -
          0.62
        ) *
        22 +

        Math.max(
          0,
          synopticLift
        ) *
        12,

        0,
        100
      );


    return {

      lat:
        lat,

      lon:
        lon,

      land:
        isLand(
          lat,
          lon
        ),

      elevationM:
        elevationAt(
          lat,
          lon
        ),

      baselineTemperatureC:
        baseT,

      temperatureC:
        temp,

      anomalyC:
        temp -
        baseT,

      pressureHpa:
        pressure,

      moisture:
        clamp(
          moisture,
          0,
          1
        ),

      cloud:
        cloud,

      uWind:
        uWind,

      vWind:
        vWind,

      windSpeed:
        Math.hypot(
          uWind,
          vWind
        ),

      synopticLift:
        synopticLift

    };

  }


  /*
      ==========================================================
      NATURAL PRECIPITATION

      There is deliberately no user precipitation object.

      The engine asks:

      1. Is enough moisture present?
      2. Are winds converging?
      3. Is low pressure generating ascent?
      4. Is real terrain forcing the air upward?
      5. Is hot/moist air convectively unstable?
      6. Is there enough cloud support?

      Only then does precipitation emerge.
      ==========================================================
  */


  function precipitationField(
    lat,
    lon,
    ms,
    centerCore =
      null
  ) {

    const c =
      centerCore ||
      coreField(
        lat,
        lon,
        ms
      );


    /*
        Sample nearby wind fields and estimate horizontal
        divergence.

        Negative divergence = convergence = rising-air tendency.
    */

    const dLat =
      0.32;


    const dLon =
      0.42;


    const west =
      coreField(
        lat,
        lon -
        dLon,
        ms
      );


    const east =
      coreField(
        lat,
        lon +
        dLon,
        ms
      );


    const south =
      coreField(
        lat -
        dLat,
        lon,
        ms
      );


    const north =
      coreField(
        lat +
        dLat,
        lon,
        ms
      );


    const dxKm =
      2 *
      dLon *
      kmPerLonDeg(
        lat
      );


    const dyKm =
      2 *
      dLat *
      KM_PER_DEG;


    const divergence =
      (
        east.uWind -
        west.uWind
      ) /
      Math.max(
        1,
        dxKm
      ) +

      (
        north.vWind -
        south.vWind
      ) /
      Math.max(
        1,
        dyKm
      );


    const convergence =
      clamp(
        -divergence *
        24,
        0,
        1.8
      );


    /*
        --------------------------------------------------------
        REAL TERRAIN UPLIFT
        --------------------------------------------------------
    */

    let oro =
      0;


    if (
      c.land &&
      c.windSpeed >
      1.2
    ) {

      const ux =
        c.uWind /
        c.windSpeed;


      const uy =
        c.vWind /
        c.windSpeed;


      function upwindElevation(
        km
      ) {

        const upLat =
          lat -
          uy *
          km /
          KM_PER_DEG;


        const upLon =
          lon -
          ux *
          km /
          kmPerLonDeg(
            lat
          );


        return elevationAt(
          upLat,
          upLon
        );

      }


      const rise =
        Math.max(
          0,
          c.elevationM -
          Math.min(
            upwindElevation(
              90
            ),
            upwindElevation(
              170
            )
          )
        );


      oro =
        clamp(
          rise /
          650,
          0,
          1.8
        ) *
        clamp(
          c.windSpeed /
          8,
          0.3,
          1.8
        );

    }


    /*
        --------------------------------------------------------
        LIMITED CONVECTION
        --------------------------------------------------------

        This is intentionally restrained.

        It allows warm/moist summer air to generate additional
        precipitation without turning the project back into the
        abandoned full atmospheric simulator.
    */

    const convective =
      c.temperatureC >
      18 &&
      c.moisture >
      0.72

        ? clamp(
            (
              c.temperatureC -
              18
            ) /
            12,
            0,
            1
          ) *
          clamp(
            (
              c.moisture -
              0.72
            ) /
            0.22,
            0,
            1
          ) *
          0.8

        : 0;


    const lift =
      Math.max(
        0,

        c.synopticLift +

        convergence *
        1.15 +

        oro +

        convective
      );


    const moist =
      clamp(
        (
          c.moisture -
          0.56
        ) /
        0.38,
        0,
        1
      );


    const cloudSupport =
      clamp(
        (
          c.cloud -
          62
        ) /
        38,
        0,
        1
      );


    let rate =
      moist *
      cloudSupport *
      (
        0.08 +
        lift *
        3.1
      );


    /*
        Weak saturated maritime drizzle.
    */

    if (
      rate <
      0.08 &&
      c.moisture >
      0.81 &&
      c.cloud >
      88 &&
      lift >
      0.05
    ) {

      rate =
        0.08 +
        (
          c.moisture -
          0.81
        ) *
        1.5;

    }


    if (
      rate <
      0.04
    ) {

      rate =
        0;

    }


    /*
        Precipitation phase from local temperature.
    */

    let phase =
      "none";


    if (
      rate >
      0
    ) {

      if (
        c.temperatureC <=
        0.2
      ) {

        phase =
          "snow";

      }
      else if (
        c.temperatureC <=
        1.0
      ) {

        phase =
          "wet snow";

      }
      else if (
        c.temperatureC <=
        2.2
      ) {

        phase =
          "sleet";

      }
      else {

        phase =
          "rain";

      }

    }


    return {

      rate:
        rate,

      phase:
        phase,

      convergence:
        convergence,

      orographicLift:
        oro,

      lift:
        lift

    };

  }


  /*
      ==========================================================
      COMPLETE WEATHER
      ==========================================================
  */


  function weatherAt(
    lat,
    lon,
    ms,
    withSnow =
      false
  ) {

    const c =
      coreField(
        lat,
        lon,
        ms
      );


    const p =
      precipitationField(
        lat,
        lon,
        ms,
        c
      );


    let snowDepth =
      0;


    /*
        Snow is only integrated when specifically required,
        such as when inspecting a point.

        The full map therefore remains responsive.
    */

    if (
      withSnow &&
      c.land
    ) {

      const start =
        ms -
        72 *
        MS_HOUR;


      for (
        let t = start;
        t <=
        ms;
        t +=
        3 *
        MS_HOUR
      ) {

        const cc =
          coreField(
            lat,
            lon,
            t
          );


        const pp =
          precipitationField(
            lat,
            lon,
            t,
            cc
          );


        const amount =
          pp.rate *
          3;


        if (
          pp.phase ===
          "snow"
        ) {

          snowDepth +=
            amount *
            0.9;

        }
        else if (
          pp.phase ===
          "wet snow"
        ) {

          snowDepth +=
            amount *
            0.5;

        }
        else if (
          pp.phase ===
          "sleet"
        ) {

          snowDepth +=
            amount *
            0.15;

        }
        else if (
          pp.phase ===
          "rain"
        ) {

          snowDepth -=
            amount *
            0.18;

        }


        if (
          cc.temperatureC >
          0
        ) {

          snowDepth -=
            (
              0.04 *
              cc.temperatureC +

              0.003 *
              cc.temperatureC *
              cc.temperatureC
            ) *
            3;

        }


        snowDepth *=
          0.998;


        snowDepth =
          Math.max(
            0,
            snowDepth
          );

      }

    }


    return {

      ...c,
      ...p,

      snowDepthCm:
        snowDepth

    };

  }


  /*
      ==========================================================
      MAP RENDERING
      ==========================================================
  */


  function drawBase() {

    ctx.clearRect(
      0,
      0,
      state.width,
      state.height
    );


    ctx.fillStyle =
      "#112a38";


    ctx.fillRect(
      0,
      0,
      state.width,
      state.height
    );


    if (
      !state.geoReady
    ) {

      ctx.fillStyle =
        "#d9e4ea";


      ctx.font =
        "bold 18px system-ui";


      ctx.textAlign =
        "center";


      ctx.fillText(
        "LOADING REAL EUROPE…",
        state.width /
        2,
        state.height /
        2
      );


      return;

    }


    ctx.imageSmoothingEnabled =
      true;


    ctx.drawImage(
      state.baseCanvas,
      0,
      0,
      state.width,
      state.height
    );

  }


  function overlayColor(
    layer,
    wx
  ) {

    /*
        TEMPERATURE
    */

    if (
      layer ===
      "temperature"
    ) {

      const t =
        clamp(
          (
            wx.temperatureC +
            20
          ) /
          55,
          0,
          1
        );


      return (
        "rgba(" +

        Math.round(
          45 +
          210 *
          t
        ) +
        "," +

        Math.round(
          95 +
          90 *
          (
            1 -
            Math.abs(
              t -
              0.5
            ) *
            2
          )
        ) +
        "," +

        Math.round(
          235 -
          205 *
          t
        ) +

        ",.48)"
      );

    }


    /*
        TEMPERATURE ANOMALY
    */

    if (
      layer ===
      "anomaly"
    ) {

      const a =
        clamp(
          Math.abs(
            wx.anomalyC
          ) /
          14,
          0,
          1
        );


      if (
        wx.anomalyC <
        -0.1
      ) {

        return (
          "rgba(" +

          Math.round(
            55 -
            20 *
            a
          ) +
          "," +

          Math.round(
            135 +
            50 *
            a
          ) +
          "," +

          Math.round(
            215 +
            30 *
            a
          ) +
          "," +

          (
            0.08 +
            0.55 *
            a
          ) +

          ")"
        );

      }


      if (
        wx.anomalyC >
        0.1
      ) {

        return (
          "rgba(" +

          Math.round(
            220 +
            30 *
            a
          ) +
          "," +

          Math.round(
            145 -
            90 *
            a
          ) +
          "," +

          Math.round(
            65 -
            30 *
            a
          ) +
          "," +

          (
            0.08 +
            0.55 *
            a
          ) +

          ")"
        );

      }


      return (
        "rgba(180,180,180,.03)"
      );

    }


    /*
        PRECIPITATION
    */

    if (
      layer ===
      "precip"
    ) {

      if (
        wx.rate <=
        0
      ) {

        return null;

      }


      const a =
        0.2 +
        0.65 *
        clamp(
          Math.log1p(
            wx.rate
          ) /
          Math.log(
            8
          ),
          0,
          1
        );


      if (
        wx.phase ===
        "snow" ||
        wx.phase ===
        "wet snow"
      ) {

        return (
          "rgba(235,245,255," +
          a +
          ")"
        );

      }


      if (
        wx.phase ===
        "sleet"
      ) {

        return (
          "rgba(145,205,235," +
          a +
          ")"
        );

      }


      return (
        "rgba(35,115,225," +
        a +
        ")"
      );

    }


    /*
        MOISTURE
    */

    if (
      layer ===
      "moisture"
    ) {

      const a =
        clamp(
          (
            wx.moisture -
            0.3
          ) /
          0.65,
          0,
          1
        );


      return (
        "rgba(" +

        Math.round(
          75 -
          30 *
          a
        ) +
        "," +

        Math.round(
          125 +
          60 *
          a
        ) +
        "," +

        Math.round(
          180 +
          60 *
          a
        ) +
        "," +

        (
          0.12 +
          0.42 *
          a
        ) +

        ")"
      );

    }


    return null;

  }


  function drawOverlay() {

    if (
      !state.geoReady ||
      state.layer ===
      "synoptic" ||
      state.layer ===
      "elevation"
    ) {

      return;

    }


    const cols =
      62;


    const rows =
      35;


    const cw =
      state.width /
      cols;


    const ch =
      state.height /
      rows;


    for (
      let gy = 0;
      gy <
      rows;
      gy++
    ) {

      const lat =
        yToLat(
          (
            gy +
            0.5
          ) *
          ch
        );


      for (
        let gx = 0;
        gx <
        cols;
        gx++
      ) {

        const lon =
          xToLon(
            (
              gx +
              0.5
            ) *
            cw
          );


        let wx;


        if (
          state.layer ===
          "precip"
        ) {

          wx =
            weatherAt(
              lat,
              lon,
              state.now,
              false
            );

        }
        else {

          wx =
            coreField(
              lat,
              lon,
              state.now
            );

        }


        const color =
          overlayColor(
            state.layer,
            wx
          );


        if (!color) {

          continue;

        }


        ctx.fillStyle =
          color;


        ctx.fillRect(
          gx *
          cw,
          gy *
          ch,
          cw +
          1,
          ch +
          1
        );

      }

    }


    drawLegend();

  }


  function drawLegend() {

    const labels = {

      temperature:
        "TEMPERATURE °C",

      anomaly:
        "TEMPERATURE ANOMALY °C",

      precip:
        "PRECIPITATION",

      moisture:
        "MOISTURE"

    };


    if (
      !labels[
        state.layer
      ]
    ) {

      return;

    }


    ctx.save();


    ctx.fillStyle =
      "rgba(7,12,16,.76)";


    ctx.fillRect(
      10,
      10,
      190,
      38
    );


    ctx.fillStyle =
      "#eef3f6";


    ctx.font =
      "bold 11px system-ui";


    ctx.fillText(
      labels[
        state.layer
      ],
      18,
      25
    );


    ctx.font =
      "10px system-ui";


    ctx.fillStyle =
      "#b8c7d1";


    ctx.fillText(
      state.layer ===
      "precip"
        ? "natural output — not painted"
        : "derived field",
      18,
      40
    );


    ctx.restore();

  }


  function drawGrid() {

    ctx.save();


    ctx.strokeStyle =
      "rgba(230,238,243,.13)";


    ctx.fillStyle =
      "rgba(235,241,245,.62)";


    ctx.lineWidth =
      1;


    ctx.font =
      "10px system-ui";


    for (
      let lon = -20;
      lon <=
      50;
      lon +=
      10
    ) {

      const x =
        lonToX(
          lon
        );


      ctx.beginPath();

      ctx.moveTo(
        x,
        0
      );

      ctx.lineTo(
        x,
        state.height
      );

      ctx.stroke();


      ctx.fillText(
        lon >=
        0
          ? lon +
            "°E"
          : Math.abs(
              lon
            ) +
            "°W",
        x +
        3,
        12
      );

    }


    for (
      let lat = 30;
      lat <=
      70;
      lat +=
      10
    ) {

      const y =
        latToY(
          lat
        );


      ctx.beginPath();

      ctx.moveTo(
        0,
        y
      );

      ctx.lineTo(
        state.width,
        y
      );

      ctx.stroke();


      ctx.fillText(
        lat +
        "°N",
        3,
        y -
        3
      );

    }


    ctx.restore();

  }


  function drawArrowHead(
    x1,
    y1,
    x2,
    y2,
    color
  ) {

    const dx =
      x2 -
      x1;


    const dy =
      y2 -
      y1;


    const len =
      Math.hypot(
        dx,
        dy
      ) ||
      1;


    const ux =
      dx /
      len;


    const uy =
      dy /
      len;


    const px =
      -uy;


    const py =
      ux;


    ctx.fillStyle =
      color;


    ctx.beginPath();


    ctx.moveTo(
      x2,
      y2
    );


    ctx.lineTo(
      x2 -
      ux *
      11 +
      px *
      5,

      y2 -
      uy *
      11 +
      py *
      5
    );


    ctx.lineTo(
      x2 -
      ux *
      11 -
      px *
      5,

      y2 -
      uy *
      11 -
      py *
      5
    );


    ctx.closePath();

    ctx.fill();

  }


  function airColor(
    type
  ) {

    if (
      type ===
      "arctic"
    ) {

      return "#a8e3ff";

    }


    if (
      type ===
      "polar_maritime"
    ) {

      return "#8acbf2";

    }


    if (
      type ===
      "atlantic"
    ) {

      return "#7eb8da";

    }


    if (
      type ===
      "continental"
    ) {

      return "#e0d39a";

    }


    if (
      type ===
      "mediterranean"
    ) {

      return "#efb66f";

    }


    return "#ef8f55";

  }


  function airLabel(
    type
  ) {

    return (
      {
        arctic:
          "ARCTIC",

        polar_maritime:
          "POLAR MARITIME",

        atlantic:
          "ATLANTIC",

        continental:
          "CONTINENTAL",

        mediterranean:
          "MEDITERRANEAN",

        tropical:
          "TROPICAL"
      }[type] ||
      "AIR"
    );

  }


  function drawAirObject(
    obj
  ) {

    const color =
      airColor(
        obj.airType
      );


    const samples =
      Math.max(
        36,
        obj.path.length *
        16
      );


    ctx.save();


    ctx.strokeStyle =
      color;


    ctx.lineWidth =
      state.selectedId ===
      obj.id
        ? 4
        : 2.2;


    ctx.globalAlpha =
      active(
        obj,
        state.now
      )
        ? 0.95
        : 0.25;


    ctx.beginPath();


    let prev =
      null;


    for (
      let i = 0;
      i <=
      samples;
      i++
    ) {

      const p =
        pathPosition(
          obj.path,
          i /
          samples
        );


      const x =
        lonToX(
          p.lon
        );


      const y =
        latToY(
          p.lat
        );


      if (
        i ===
        0
      ) {

        ctx.moveTo(
          x,
          y
        );

      }
      else {

        ctx.lineTo(
          x,
          y
        );

      }


      if (
        i >
        0 &&
        i %
        Math.max(
          8,
          Math.floor(
            samples /
            5
          )
        ) ===
        0 &&
        prev
      ) {

        drawArrowHead(
          prev.x,
          prev.y,
          x,
          y,
          color
        );

      }


      prev = {
        x:
          x,

        y:
          y
      };

    }


    ctx.stroke();


    /*
        Current head / active air mass.
    */

    if (
      active(
        obj,
        state.now
      )
    ) {

      const pr =
        progress(
          obj,
          state.now
        );


      const head =
        pathPosition(
          obj.path,
          pr
        );


      const x =
        lonToX(
          head.lon
        );


      const y =
        latToY(
          head.lat
        );


      const moisture =
        moistureAlongPath(
          obj,
          pr
        );


      const anom =
        airBaseAnomaly(
          obj.airType,
          state.now
        ) *
        intensityMultiplier(
          obj.intensity
        );


      const rx =
        Math.abs(
          lonToX(
            head.lon +
            obj.widthKm /
            kmPerLonDeg(
              head.lat
            )
          ) -
          x
        );


      const ry =
        Math.abs(
          latToY(
            head.lat +
            obj.widthKm /
            KM_PER_DEG
          ) -
          y
        );


      ctx.fillStyle =
        color;


      ctx.globalAlpha =
        0.12;


      ctx.beginPath();


      ctx.ellipse(
        x,
        y,
        Math.max(
          10,
          rx
        ),
        Math.max(
          10,
          ry
        ),
        0,
        0,
        Math.PI *
        2
      );


      ctx.fill();


      ctx.globalAlpha =
        1;


      ctx.fillStyle =
        "rgba(8,13,18,.82)";


      ctx.fillRect(
        x -
        73,
        y -
        30,
        146,
        42
      );


      ctx.fillStyle =
        color;


      ctx.font =
        "bold 11px system-ui";


      ctx.textAlign =
        "center";


      ctx.fillText(
        airLabel(
          obj.airType
        ) +
        " " +
        (
          anom >=
          0
            ? "+"
            : ""
        ) +
        anom.toFixed(
          1
        ) +
        "°",
        x,
        y -
        14
      );


      ctx.fillStyle =
        "#e7eef2";


      ctx.font =
        "10px system-ui";


      ctx.fillText(
        "moisture " +
        Math.round(
          moisture *
          100
        ) +
        "%",
        x,
        y +
        1
      );

    }


    ctx.restore();

  }


  function drawPressure(
    obj
  ) {

    if (
      !active(
        obj,
        state.now
      )
    ) {

      return;

    }


    const x =
      lonToX(
        obj.lon
      );


    const y =
      latToY(
        obj.lat
      );


    const high =
      obj.kind ===
      "high";


    ctx.save();


    ctx.fillStyle =
      "rgba(8,13,18,.82)";


    ctx.strokeStyle =
      high
        ? "#9edcf5"
        : "#f39d9d";


    ctx.lineWidth =
      state.selectedId ===
      obj.id
        ? 3.5
        : 2;


    ctx.beginPath();


    ctx.arc(
      x,
      y,
      22,
      0,
      Math.PI *
      2
    );


    ctx.fill();

    ctx.stroke();


    ctx.fillStyle =
      ctx.strokeStyle;


    ctx.font =
      "bold 22px system-ui";


    ctx.textAlign =
      "center";


    ctx.textBaseline =
      "middle";


    ctx.fillText(
      high
        ? "H"
        : "L",
      x,
      y -
      2
    );


    ctx.fillStyle =
      "#eef3f6";


    ctx.font =
      "10px system-ui";


    const p =
      1014 +
      pressureStrength(
        obj.strength
      ) *
      (
        high
          ? 1
          : -1
      );


    ctx.fillText(
      Math.round(
        p
      ) +
      " hPa",
      x,
      y +
      31
    );


    ctx.restore();

  }


  function drawObjects() {

    for (
      const obj of
      plan.objects
    ) {

      if (
        obj.kind ===
        "air"
      ) {

        drawAirObject(
          obj
        );

      }

    }


    for (
      const obj of
      plan.objects
    ) {

      if (
        obj.kind ===
        "high" ||
        obj.kind ===
        "low"
      ) {

        drawPressure(
          obj
        );

      }

    }

  }


  function drawDraft() {

    if (
      !state.drawActive ||
      state.drawPath.length ===
      0
    ) {

      return;

    }


    ctx.save();


    ctx.strokeStyle =
      "#ffe07a";


    ctx.fillStyle =
      "#ffe07a";


    ctx.lineWidth =
      2.5;


    ctx.setLineDash(
      [
        7,
        5
      ]
    );


    ctx.beginPath();


    state.drawPath.forEach(
      (
        p,
        i
      ) => {

        const x =
          lonToX(
            p.lon
          );


        const y =
          latToY(
            p.lat
          );


        if (
          i ===
          0
        ) {

          ctx.moveTo(
            x,
            y
          );

        }
        else {

          ctx.lineTo(
            x,
            y
          );

        }

      }
    );


    ctx.stroke();


    ctx.setLineDash(
      []
    );


    for (
      const p of
      state.drawPath
    ) {

      ctx.beginPath();


      ctx.arc(
        lonToX(
          p.lon
        ),
        latToY(
          p.lat
        ),
        4,
        0,
        Math.PI *
        2
      );


      ctx.fill();

    }


    ctx.restore();

  }


  function drawInspectMarker() {

    const p =
      state.inspect;


    if (!p) {

      return;

    }


    const x =
      lonToX(
        p.lon
      );


    const y =
      latToY(
        p.lat
      );


    ctx.save();


    ctx.strokeStyle =
      "#ffe168";


    ctx.lineWidth =
      1.5;


    ctx.beginPath();


    ctx.arc(
      x,
      y,
      6,
      0,
      Math.PI *
      2
    );


    ctx.stroke();


    ctx.beginPath();


    ctx.moveTo(
      x -
      10,
      y
    );


    ctx.lineTo(
      x +
      10,
      y
    );


    ctx.moveTo(
      x,
      y -
      10
    );


    ctx.lineTo(
      x,
      y +
      10
    );


    ctx.stroke();


    ctx.restore();

  }


  function render() {

    drawBase();


    if (
      state.layer !==
      "elevation"
    ) {

      drawOverlay();

    }


    drawGrid();

    drawObjects();

    drawDraft();

    drawInspectMarker();

  }


  function resize() {

    const r =
      canvas.getBoundingClientRect();


    state.width =
      Math.max(
        320,
        Math.round(
          r.width
        )
      );


    state.height =
      Math.max(
        360,
        Math.round(
          r.height
        )
      );


    state.dpr =
      Math.max(
        1,
        Math.min(
          2,
          window.devicePixelRatio ||
          1
        )
      );


    canvas.width =
      Math.round(
        state.width *
        state.dpr
      );


    canvas.height =
      Math.round(
        state.height *
        state.dpr
      );


    ctx.setTransform(
      state.dpr,
      0,
      0,
      state.dpr,
      0,
      0
    );


    render();

  }


  /*
      ==========================================================
      TOOL SELECTION
      ==========================================================
  */


  function setTool(
    tool
  ) {

    if (
      state.drawActive &&
      tool !==
      "air"
    ) {

      cancelAir();

    }


    state.tool =
      tool;


    document
      .querySelectorAll(
        "[data-tool]"
      )
      .forEach(
        button => {

          button.classList.toggle(
            "active",
            button.dataset.tool ===
            tool
          );

        }
      );


    if (
      tool ===
      "inspect"
    ) {

      ui.mapHint.textContent =
        "Inspect: click anywhere for local weather. Click an H/L or use the active-system list to select it.";

    }


    if (
      tool ===
      "air"
    ) {

      startAir();

    }


    if (
      tool ===
      "high"
    ) {

      ui.mapHint.textContent =
        "High: click where you want the high-pressure centre.";

    }


    if (
      tool ===
      "low"
    ) {

      ui.mapHint.textContent =
        "Low: click where you want the low-pressure centre.";

    }

  }


  /*
      ==========================================================
      DRAW AIR
      ==========================================================
  */


  function startAir() {

    if (
      isLocked(
        state.now
      )
    ) {

      msg(
        "You cannot start a new air stream inside locked time.",
        "LOCKED:"
      );


      state.tool =
        "inspect";


      document
        .querySelectorAll(
          "[data-tool]"
        )
        .forEach(
          button => {

            button.classList.toggle(
              "active",
              button.dataset.tool ===
              "inspect"
            );

          }
        );


      return;

    }


    state.drawActive =
      true;


    state.drawPath =
      [];


    ui.finishAir.classList.remove(
      "hidden"
    );


    ui.cancelAir.classList.remove(
      "hidden"
    );


    ui.finishAir.disabled =
      true;


    ui.mapHint.textContent =
      "Draw Air: click a source, then as many bends/zig-zags as you want. Finish Air or press Enter.";

  }


  function cancelAir() {

    state.drawActive =
      false;


    state.drawPath =
      [];


    ui.finishAir.classList.add(
      "hidden"
    );


    ui.cancelAir.classList.add(
      "hidden"
    );


    state.tool =
      "inspect";


    document
      .querySelectorAll(
        "[data-tool]"
      )
      .forEach(
        button => {

          button.classList.toggle(
            "active",
            button.dataset.tool ===
            "inspect"
          );

        }
      );


    ui.mapHint.textContent =
      "Inspect: click anywhere for local weather.";


    render();

  }


  function finishAir() {

    if (
      !state.drawActive ||
      state.drawPath.length <
      2
    ) {

      msg(
        "Add at least two points to the air path."
      );


      return;

    }


    const duration =
      Number(
        ui.airDuration.value
      ) *
      MS_HOUR;


    const obj = {

      id:
        uid(
          "air"
        ),

      kind:
        "air",

      airType:
        ui.airType.value,

      intensity:
        ui.airIntensity.value,

      widthKm:
        Number(
          ui.airWidth.value
        ),

      startTime:
        new Date(
          state.now
        ).toISOString(),

      endTime:
        new Date(
          Math.min(
            Date.parse(
              plan.blockEnd
            ),
            state.now +
            duration
          )
        ).toISOString(),

      path:
        state.drawPath.map(
          p => ({
            lat:
              p.lat,

            lon:
              p.lon
          })
        )

    };


    plan.objects.push(
      obj
    );


    state.selectedId =
      obj.id;


    state.drawActive =
      false;


    state.drawPath =
      [];


    ui.finishAir.classList.add(
      "hidden"
    );


    ui.cancelAir.classList.add(
      "hidden"
    );


    state.tool =
      "inspect";


    document
      .querySelectorAll(
        "[data-tool]"
      )
      .forEach(
        button => {

          button.classList.toggle(
            "active",
            button.dataset.tool ===
            "inspect"
          );

        }
      );


    ui.mapHint.textContent =
      "Air stream created. Scrub time and switch to Temperature, Anomaly or Precipitation to inspect the result.";


    savePlanSilently();

    updateObjects();

    render();


    msg(
      "Air stream created. Precipitation remains a calculated output; you never paint it."
    );

  }


  /*
      ==========================================================
      PRESSURE SYSTEMS
      ==========================================================
  */


  function addPressure(
    kind,
    lat,
    lon
  ) {

    if (
      isLocked(
        state.now
      )
    ) {

      msg(
        "You cannot place pressure systems inside locked time.",
        "LOCKED:"
      );


      return;

    }


    const duration =
      Number(
        ui.pressureDuration.value
      ) *
      MS_HOUR;


    const obj = {

      id:
        uid(
          kind
        ),

      kind:
        kind,

      lat:
        lat,

      lon:
        lon,

      strength:
        ui.pressureStrength.value,

      radiusKm:
        kind ===
        "low"
          ? 850
          : 1000,

      startTime:
        new Date(
          state.now
        ).toISOString(),

      endTime:
        new Date(
          Math.min(
            Date.parse(
              plan.blockEnd
            ),
            state.now +
            duration
          )
        ).toISOString()

    };


    plan.objects.push(
      obj
    );


    state.selectedId =
      obj.id;


    savePlanSilently();

    updateObjects();

    render();


    setTool(
      "inspect"
    );


    msg(
      (
        kind ===
        "high"
          ? "High"
          : "Low"
      ) +
      " placed."
    );

  }


  /*
      ==========================================================
      MAP INTERACTION
      ==========================================================
  */


  function nearestPressure(
    x,
    y
  ) {

    let best =
      null;


    let bestD =
      25;


    for (
      const obj of
      plan.objects
    ) {

      if (
        (
          obj.kind !==
          "high" &&
          obj.kind !==
          "low"
        ) ||
        !active(
          obj,
          state.now
        )
      ) {

        continue;

      }


      const d =
        Math.hypot(
          lonToX(
            obj.lon
          ) -
          x,

          latToY(
            obj.lat
          ) -
          y
        );


      if (
        d <
        bestD
      ) {

        bestD =
          d;


        best =
          obj;

      }

    }


    return best;

  }


  function onMapClick(
    evt
  ) {

    if (
      !state.geoReady
    ) {

      return;

    }


    const p =
      canvasPoint(
        evt
      );


    const lat =
      clamp(
        yToLat(
          p.y
        ),
        BOUNDS.south,
        BOUNDS.north
      );


    const lon =
      clamp(
        xToLon(
          p.x
        ),
        BOUNDS.west,
        BOUNDS.east
      );


    /*
        Air-path drawing.
    */

    if (
      state.drawActive
    ) {

      state.drawPath.push({

        lat:
          lat,

        lon:
          lon

      });


      ui.finishAir.disabled =
        state.drawPath.length <
        2;


      render();


      msg(
        state.drawPath.length +
        " path point" +
        (
          state.drawPath.length ===
          1
            ? ""
            : "s"
        ) +
        ". Keep clicking bends or Finish Air."
      );


      return;

    }


    /*
        Pressure placement.
    */

    if (
      state.tool ===
      "high" ||
      state.tool ===
      "low"
    ) {

      addPressure(
        state.tool,
        lat,
        lon
      );


      return;

    }


    /*
        Pressure selection.
    */

    const near =
      nearestPressure(
        p.x,
        p.y
      );


    if (
      near
    ) {

      state.selectedId =
        near.id;


      updateObjects();

      render();


      return;

    }


    /*
        Ordinary inspection.
    */

    state.inspect = {

      lat:
        lat,

      lon:
        lon

    };


    state.selectedId =
      null;


    updateObjects();

    updateInspect();

    render();

  }


  function onPointerMove(
    evt
  ) {

    if (
      !state.geoReady
    ) {

      return;

    }


    const p =
      canvasPoint(
        evt
      );


    const lat =
      clamp(
        yToLat(
          p.y
        ),
        BOUNDS.south,
        BOUNDS.north
      );


    const lon =
      clamp(
        xToLon(
          p.x
        ),
        BOUNDS.west,
        BOUNDS.east
      );


    const land =
      isLand(
        lat,
        lon
      );


    const elev =
      land
        ? Math.round(
            elevationAt(
              lat,
              lon
            )
          )
        : 0;


    ui.coords.textContent =
      lat.toFixed(
        2
      ) +
      "°N, " +
      (
        lon >=
        0
          ? lon.toFixed(
              2
            ) +
            "°E"
          : Math.abs(
              lon
            ).toFixed(
              2
            ) +
            "°W"
      ) +
      " · " +
      (
        land
          ? elev +
            " m"
          : "SEA"
      );

  }


  /*
      ==========================================================
      INSPECTION
      ==========================================================
  */


  function updateInspect() {

    if (
      !state.geoReady ||
      !state.inspect
    ) {

      return;

    }


    const wx =
      weatherAt(
        state.inspect.lat,
        state.inspect.lon,
        state.now,
        true
      );


    const p =
      state.inspect;


    ui.where.textContent =
      p.lat.toFixed(
        2
      ) +
      "°N, " +
      (
        p.lon >=
        0
          ? p.lon.toFixed(
              2
            ) +
            "°E"
          : Math.abs(
              p.lon
            ).toFixed(
              2
            ) +
            "°W"
      ) +
      " · " +
      formatUTC(
        state.now
      );


    ui.wxTemp.textContent =
      wx.temperatureC.toFixed(
        1
      ) +
      " °C";


    ui.wxAnom.textContent =
      (
        wx.anomalyC >=
        0
          ? "+"
          : ""
      ) +
      wx.anomalyC.toFixed(
        1
      ) +
      " °C";


    ui.wxPressure.textContent =
      Math.round(
        wx.pressureHpa
      ) +
      " hPa";


    const toward =
      normDeg(
        radToDeg(
          Math.atan2(
            wx.uWind,
            wx.vWind
          )
        )
      );


    const from =
      normDeg(
        toward +
        180
      );


    ui.wxWind.textContent =
      windName(
        from
      ) +
      " " +
      wx.windSpeed.toFixed(
        1
      ) +
      " m/s";


    ui.wxCloud.textContent =
      Math.round(
        wx.cloud
      ) +
      "%";


    ui.wxMoisture.textContent =
      Math.round(
        wx.moisture *
        100
      ) +
      "%";


    ui.wxPrecip.textContent =
      wx.rate >
      0

        ? titleCase(
            wx.phase
          ) +
          " · " +
          wx.rate.toFixed(
            2
          ) +
          " mm/h"

        : "Dry";


    ui.wxSnow.textContent =
      wx.snowDepthCm <
      0.1

        ? "0 cm"

        : wx.snowDepthCm.toFixed(
            1
          ) +
          " cm";


    ui.wxElevation.textContent =
      wx.land
        ? Math.round(
            wx.elevationM
          ) +
          " m"
        : "Sea";

  }


  function titleCase(
    s
  ) {

    return s.replace(
      /\b\w/g,
      c =>
        c.toUpperCase()
    );

  }


  function windName(
    deg
  ) {

    const dirs = [
      "N",
      "NE",
      "E",
      "SE",
      "S",
      "SW",
      "W",
      "NW"
    ];


    return dirs[
      Math.round(
        normDeg(
          deg
        ) /
        45
      ) %
      8
    ];

  }


  /*
      ==========================================================
      ACTIVE SYSTEM LIST
      ==========================================================
  */


  function objectName(
    obj
  ) {

    if (
      obj.kind ===
      "air"
    ) {

      return (
        airLabel(
          obj.airType
        ) +
        " air"
      );

    }


    return (
      obj.kind ===
      "high"
        ? "High pressure"
        : "Low pressure"
    );

  }


  function updateObjects() {

    ui.objects.innerHTML =
      "";


    const activeObjects =
      plan.objects.filter(
        obj =>
          active(
            obj,
            state.now
          )
      );


    if (
      activeObjects.length ===
      0
    ) {

      const d =
        document.createElement(
          "div"
        );


      d.className =
        "small";


      d.textContent =
        "None active at this time.";


      ui.objects.appendChild(
        d
      );

    }


    for (
      const obj of
      activeObjects
    ) {

      const b =
        document.createElement(
          "button"
        );


      b.className =
        "obj" +
        (
          state.selectedId ===
          obj.id
            ? " selected"
            : ""
        );


      b.type =
        "button";


      const left =
        document.createElement(
          "span"
        );


      left.textContent =
        objectName(
          obj
        );


      const right =
        document.createElement(
          "small"
        );


      right.textContent =
        obj.kind ===
        "air"
          ? obj.intensity
          : obj.strength;


      b.append(
        left,
        right
      );


      b.addEventListener(
        "click",
        () => {

          state.selectedId =
            obj.id;


          updateObjects();

          render();

        }
      );


      ui.objects.appendChild(
        b
      );

    }


    const selected =
      plan.objects.find(
        obj =>
          obj.id ===
          state.selectedId
      );


    ui.deleteSelected.disabled =
      !selected ||
      objectFrozen(
        selected
      );

  }


  function deleteSelected() {

    const obj =
      plan.objects.find(
        item =>
          item.id ===
          state.selectedId
      );


    if (!obj) {

      return;

    }


    if (
      objectFrozen(
        obj
      )
    ) {

      msg(
        "That system touches locked weather and cannot be deleted.",
        "LOCKED:"
      );


      return;

    }


    plan.objects =
      plan.objects.filter(
        item =>
          item.id !==
          obj.id
      );


    state.selectedId =
      null;


    savePlanSilently();

    updateObjects();

    updateInspect();

    render();


    msg(
      "Selected system deleted."
    );

  }


  /*
      ==========================================================
      DONE / LOCK
      ==========================================================
  */


  function markDone() {

    if (
      plan.lockedThrough &&
      state.now <
      Date.parse(
        plan.lockedThrough
      )
    ) {

      msg(
        "Done state cannot move behind the locked boundary.",
        "LOCKED:"
      );


      return;

    }


    plan.doneThrough =
      new Date(
        state.now
      ).toISOString();


    savePlanSilently();

    updateTop();


    msg(
      "Weather marked Done through " +
      formatUTC(
        state.now
      ) +
      "."
    );

  }


  function lockThrough() {

    if (
      !plan.doneThrough ||
      Date.parse(
        plan.doneThrough
      ) <
      state.now
    ) {

      msg(
        "Mark this time Done before locking it."
      );


      return;

    }


    if (
      plan.lockedThrough &&
      state.now <=
      Date.parse(
        plan.lockedThrough
      )
    ) {

      msg(
        "This time is already locked."
      );


      return;

    }


    plan.lockedThrough =
      new Date(
        state.now
      ).toISOString();


    savePlanSilently();

    updateTop();

    updateObjects();


    msg(
      "Locked permanently through " +
      formatUTC(
        state.now
      ) +
      "."
    );

  }


  /*
      ==========================================================
      NEXT 3-MONTH BLOCK
      ==========================================================
  */


  function nextThreeMonthBlock() {

    if (
      !plan.lockedThrough ||
      Date.parse(
        plan.lockedThrough
      ) <
      Date.parse(
        plan.blockEnd
      ) -
      60000
    ) {

      const ok =
        confirm(
          "The current block is not locked through its end. Start the next 3-month block anyway?"
        );


      if (!ok) {

        return;

      }

    }


    const d =
      new Date(
        Date.parse(
          plan.blockEnd
        ) +
        1000
      );


    const start =
      Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        1,
        0,
        0,
        0
      );


    const endDate =
      new Date(
        start
      );


    endDate.setUTCMonth(
      endDate.getUTCMonth() +
      3
    );


    const end =
      endDate.getTime() -
      1000;


    plan.blockStart =
      new Date(
        start
      ).toISOString();


    plan.blockEnd =
      new Date(
        end
      ).toISOString();


    state.now =
      start;


    state.selectedId =
      null;


    savePlanSilently();

    rebuildTimeline();

    updateTop();

    updateObjects();

    updateInspect();

    render();


    msg(
      "Started the next 3-month block. The final 12 locked hours remain available before it."
    );

  }


  /*
      ==========================================================
      EXPORT
      ==========================================================
  */


  function exportPlan() {

    const payload = {

      format:
        "EuropaCraftWeatherPlan",

      formatVersion:
        1,

      exportedAt:
        new Date()
          .toISOString(),

      deterministic:
        true,

      weatherApi:
        false,

      geography: {

        land:
          "Natural Earth 1:50m land",

        elevation:
          "AWS Open Data Terrain Tiles / Terrarium",

        bounds:
          BOUNDS,

        terrainZoom:
          TERRAIN_ZOOM

      },

      engine: {

        precipitation:
          "derived from moisture, convergence, pressure lift, orography and convection",

        precipitationIsAuthored:
          false,

        temperatureAnomalyIsPainted:
          false

      },

      plan:
        plan

    };


    const blob =
      new Blob(
        [
          JSON.stringify(
            payload,
            null,
            2
          )
        ],
        {
          type:
            "application/json"
        }
      );


    const url =
      URL.createObjectURL(
        blob
      );


    const a =
      document.createElement(
        "a"
      );


    a.href =
      url;


    a.download =
      "europacraft-weather-plan.json";


    document.body.appendChild(
      a
    );


    a.click();

    a.remove();


    setTimeout(
      () =>
        URL.revokeObjectURL(
          url
        ),
      1000
    );


    msg(
      "Weather plan exported."
    );

  }


  /*
      ==========================================================
      RESET
      ==========================================================
  */


  function resetPlan() {

    if (
      !confirm(
        "Delete the local weather plan and start again?"
      )
    ) {

      return;

    }


    localStorage.removeItem(
      STORAGE_KEY
    );


    plan =
      structuredCloneSafe(
        DEFAULT_PLAN
      );


    state.now =
      Date.parse(
        plan.blockStart
      );


    state.selectedId =
      null;


    state.drawActive =
      false;


    state.drawPath =
      [];


    rebuildTimeline();

    updateTop();

    updateObjects();

    updateInspect();

    render();


    msg(
      "Local weather plan reset."
    );

  }


  /*
      ==========================================================
      EVENTS
      ==========================================================
  */


  function installEvents() {

    document
      .querySelectorAll(
        "[data-tool]"
      )
      .forEach(
        button =>
          button.addEventListener(
            "click",
            () =>
              setTool(
                button.dataset.tool
              )
          )
      );


    ui.finishAir.addEventListener(
      "click",
      finishAir
    );


    ui.cancelAir.addEventListener(
      "click",
      cancelAir
    );


    ui.layer.addEventListener(
      "change",
      () => {

        state.layer =
          ui.layer.value;


        render();

      }
    );


    canvas.addEventListener(
      "click",
      onMapClick
    );


    canvas.addEventListener(
      "pointermove",
      onPointerMove
    );


    canvas.addEventListener(
      "pointerleave",
      () => {

        ui.coords.textContent =
          "—";

      }
    );


    canvas.addEventListener(
      "dblclick",
      evt => {

        if (
          state.drawActive &&
          state.drawPath.length >=
          2
        ) {

          evt.preventDefault();

          finishAir();

        }

      }
    );


    ui.timeSlider.addEventListener(
      "input",
      () => {

        const f =
          Number(
            ui.timeSlider.value
          ) /
          2000;


        setTime(
          state.displayStart +
          f *
          (
            state.displayEnd -
            state.displayStart
          )
        );

      }
    );


    ui.timeInput.addEventListener(
      "change",
      () => {

        const t =
          parseLocalInputAsUTC(
            ui.timeInput.value
          );


        if (
          Number.isFinite(
            t
          )
        ) {

          setTime(
            t
          );

        }
        else {

          syncTimeControls();

        }

      }
    );


    ui.m6.addEventListener(
      "click",
      () =>
        setTime(
          state.now -
          6 *
          MS_HOUR
        )
    );


    ui.m1.addEventListener(
      "click",
      () =>
        setTime(
          state.now -
          MS_HOUR
        )
    );


    ui.p1.addEventListener(
      "click",
      () =>
        setTime(
          state.now +
          MS_HOUR
        )
    );


    ui.p6.addEventListener(
      "click",
      () =>
        setTime(
          state.now +
          6 *
          MS_HOUR
        )
    );


    ui.deleteSelected.addEventListener(
      "click",
      deleteSelected
    );


    ui.markDone.addEventListener(
      "click",
      markDone
    );


    ui.lockThrough.addEventListener(
      "click",
      lockThrough
    );


    ui.nextBlock.addEventListener(
      "click",
      nextThreeMonthBlock
    );


    ui.save.addEventListener(
      "click",
      savePlan
    );


    ui.export.addEventListener(
      "click",
      exportPlan
    );


    ui.reset.addEventListener(
      "click",
      resetPlan
    );


    window.addEventListener(
      "resize",
      resize
    );


    window.addEventListener(
      "keydown",
      evt => {

        const tag =
          document.activeElement &&
          document.activeElement.tagName;


        if (
          tag ===
          "INPUT" ||
          tag ===
          "SELECT"
        ) {

          return;

        }


        if (
          evt.key ===
          "Enter" &&
          state.drawActive
        ) {

          evt.preventDefault();

          finishAir();

        }


        if (
          evt.key ===
          "Escape" &&
          state.drawActive
        ) {

          evt.preventDefault();

          cancelAir();

        }

      }
    );

  }


  /*
      ==========================================================
      START
      ==========================================================
  */


  function initialise() {

    installEvents();

    rebuildTimeline();

    updateTop();

    updateObjects();

    resize();

    loadGeography();

  }


  initialise();

})();
