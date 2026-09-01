"use strict";

(() => {

  const B = {
    north: 74,
    south: 30,
    west: -26,
    east: 52
  };


  const HOUR =
    3600000;


  const DAY =
    86400000;


  const KM_PER_DEG =
    111.32;


  const STORAGE =
    "europacraft-weather-studio-v3";


  /*
      Real geography.

      It tries several real Natural Earth sources rather than
      falling back to invented polygons.
  */

  const GEO_URLS = [

    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson",

    "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_land.geojson",

    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson"

  ];


  /*
      Real elevation.

      Zoom 4 is deliberately continental-scale.
  */

  const TERRAIN_Z =
    4;


  const TERRAIN_HOSTS = [

    "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",

    "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png"

  ];


  const defaults = {

    version:
      3,

    blockStart:
      "2026-10-01T00:00:00Z",

    blockEnd:
      "2026-12-31T23:59:59Z",

    doneThrough:
      null,

    lockedThrough:
      null,

    objects:
      []

  };


  const $ =
    id =>
      document.getElementById(
        id
      );


  const ui = {

    canvas:
      $("map"),

    currentTime:
      $("currentTime"),

    planRange:
      $("planRange"),

    planState:
      $("planState"),

    mapHint:
      $("mapHint"),

    coords:
      $("coords"),

    message:
      $("message"),

    layer:
      $("layer"),

    finishAir:
      $("finishAir"),

    cancelAir:
      $("cancelAir"),

    airType:
      $("airType"),

    airIntensity:
      $("airIntensity"),

    airWidth:
      $("airWidth"),

    airDuration:
      $("airDuration"),

    pressureStrength:
      $("pressureStrength"),

    pressureDuration:
      $("pressureDuration"),

    timeSlider:
      $("timeSlider"),

    timeInput:
      $("timeInput"),

    timeStart:
      $("timeStart"),

    timeMiddle:
      $("timeMiddle"),

    timeEnd:
      $("timeEnd"),

    wxTemp:
      $("wxTemp"),

    wxAnom:
      $("wxAnom"),

    wxPressure:
      $("wxPressure"),

    wxWind:
      $("wxWind"),

    wxCloud:
      $("wxCloud"),

    wxMoisture:
      $("wxMoisture"),

    wxPrecip:
      $("wxPrecip"),

    wxSnow:
      $("wxSnow"),

    wxElevation:
      $("wxElevation"),

    where:
      $("where"),

    objects:
      $("objects"),

    deleteSelected:
      $("deleteSelected"),

    markDone:
      $("markDone"),

    lockThrough:
      $("lockThrough"),

    save:
      $("save"),

    export:
      $("export"),

    reset:
      $("reset"),

    m6:
      $("m6"),

    m1:
      $("m1"),

    p1:
      $("p1"),

    p6:
      $("p6")

  };


  if (
    !ui.canvas
  ) {

    throw new Error(
      "EuropaCraft Weather Studio: #map canvas not found."
    );

  }


  const ctx =
    ui.canvas.getContext(
      "2d"
    );


  const clone =
    x =>
      JSON.parse(
        JSON.stringify(
          x
        )
      );


  let plan =
    loadPlan() ||
    clone(
      defaults
    );


  const state = {

    tool:
      "inspect",

    layer:
      "synoptic",

    now:
      Date.parse(
        plan.blockStart
      ),

    selectedId:
      null,

    inspect: {
      lat: 51.25,
      lon: 0.5
    },

    drawing:
      false,

    draftPath:
      [],

    w:
      1000,

    h:
      600,

    dpr:
      1,

    geoReady:
      false,

    terrainReady:
      false,

    landData:
      null,

    terrainTiles:
      new Map(),

    baseCanvas:
      document.createElement(
        "canvas"
      )

  };


  const landCanvas =
    document.createElement(
      "canvas"
    );


  landCanvas.width =
    780;


  landCanvas.height =
    440;


  const landCtx =
    landCanvas.getContext(
      "2d",
      {
        willReadFrequently:
          true
      }
    );


  function clamp(
    v,
    a,
    b
  ) {

    return Math.max(
      a,
      Math.min(
        b,
        Number(v)
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


  function smooth(
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


  function rad(
    d
  ) {

    return (
      d *
      Math.PI /
      180
    );

  }


  function deg(
    r
  ) {

    return (
      r *
      180 /
      Math.PI
    );

  }


  function pad(
    n
  ) {

    return String(
      n
    ).padStart(
      2,
      "0"
    );

  }


  function sign1(
    v
  ) {

    return (
      v >=
      0
        ? "+"
        : ""
    );

  }


  function uid(
    prefix
  ) {

    return (
      `${prefix}_` +
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


  function msg(
    s
  ) {

    ui.message.textContent =
      s;

  }


  function monthName(
    m
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
    ][m];

  }


  function fmt(
    ms
  ) {

    const d =
      new Date(
        ms
      );


    return (
      d.getUTCFullYear() +
      "-" +
      pad(
        d.getUTCMonth() +
        1
      ) +
      "-" +
      pad(
        d.getUTCDate()
      ) +
      " " +
      pad(
        d.getUTCHours()
      ) +
      ":" +
      pad(
        d.getUTCMinutes()
      ) +
      " UTC"
    );

  }


  function shortFmt(
    ms
  ) {

    const d =
      new Date(
        ms
      );


    return (
      pad(
        d.getUTCDate()
      ) +
      " " +
      monthName(
        d.getUTCMonth()
      ) +
      " " +
      pad(
        d.getUTCHours()
      ) +
      ":" +
      pad(
        d.getUTCMinutes()
      )
    );

  }


  function inputFmt(
    ms
  ) {

    const d =
      new Date(
        ms
      );


    return (
      d.getUTCFullYear() +
      "-" +
      pad(
        d.getUTCMonth() +
        1
      ) +
      "-" +
      pad(
        d.getUTCDate()
      ) +
      "T" +
      pad(
        d.getUTCHours()
      ) +
      ":" +
      pad(
        d.getUTCMinutes()
      )
    );

  }


  function parseInput(
    s
  ) {

    const m =
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
      .exec(
        s ||
        ""
      );


    return m
      ? Date.UTC(
          +m[1],
          +m[2] -
          1,
          +m[3],
          +m[4],
          +m[5]
        )
      : NaN;

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
        DAY
      ) +
      1
    );

  }


  function saveSilent() {

    localStorage.setItem(
      STORAGE,
      JSON.stringify(
        plan
      )
    );

  }


  function loadPlan() {

    try {

      const raw =
        localStorage.getItem(
          STORAGE
        );


      if (!raw) {

        return null;

      }


      const p =
        JSON.parse(
          raw
        );


      return (
        p &&
        Array.isArray(
          p.objects
        )
          ? p
          : null
      );

    }
    catch {

      return null;

    }

  }


  /*
      =========================================================
      MAP COORDINATES
      =========================================================
  */


  function lonX(
    lon,
    w =
      state.w
  ) {

    return (
      (
        lon -
        B.west
      ) /
      (
        B.east -
        B.west
      ) *
      w
    );

  }


  function latY(
    lat,
    h =
      state.h
  ) {

    return (
      (
        B.north -
        lat
      ) /
      (
        B.north -
        B.south
      ) *
      h
    );

  }


  function xLon(
    x,
    w =
      state.w
  ) {

    return (
      B.west +
      x /
      w *
      (
        B.east -
        B.west
      )
    );

  }


  function yLat(
    y,
    h =
      state.h
  ) {

    return (
      B.north -
      y /
      h *
      (
        B.north -
        B.south
      )
    );

  }


  function kmLon(
    lat
  ) {

    return (
      KM_PER_DEG *
      Math.max(
        .12,
        Math.cos(
          rad(
            lat
          )
        )
      )
    );

  }


  function distKm(
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


    return Math.hypot(

      (
        bLon -
        aLon
      ) *
      kmLon(
        ml
      ),

      (
        bLat -
        aLat
      ) *
      KM_PER_DEG

    );

  }


  function vecKm(
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
        kmLon(
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


  function canvasPoint(
    e
  ) {

    const r =
      ui.canvas.getBoundingClientRect();


    return {

      x:
        (
          e.clientX -
          r.left
        ) *
        state.w /
        r.width,

      y:
        (
          e.clientY -
          r.top
        ) *
        state.h /
        r.height

    };

  }


  /*
      =========================================================
      LOCK STATE
      =========================================================
  */


  function isLocked(
    ms
  ) {

    return (
      !!plan.lockedThrough &&
      ms <=
      Date.parse(
        plan.lockedThrough
      )
    );

  }


  function frozen(
    obj
  ) {

    return (
      !!plan.lockedThrough &&
      Date.parse(
        obj.startTime
      ) <=
      Date.parse(
        plan.lockedThrough
      )
    );

  }


  function planState() {

    if (
      plan.lockedThrough &&
      state.now <=
      Date.parse(
        plan.lockedThrough
      )
    ) {

      return "LOCKED";

    }


    if (
      plan.doneThrough &&
      state.now <=
      Date.parse(
        plan.doneThrough
      )
    ) {

      return "DONE";

    }


    return "NOT DONE";

  }


  /*
      =========================================================
      TIMELINE
      =========================================================
  */


  function syncTimeline() {

    const a =
      Date.parse(
        plan.blockStart
      );


    const b =
      Date.parse(
        plan.blockEnd
      );


    state.now =
      clamp(
        state.now,
        a,
        b
      );


    ui.currentTime.textContent =
      fmt(
        state.now
      );


    ui.planRange.textContent =
      shortFmt(
        a
      ) +
      " → " +
      shortFmt(
        b
      );


    ui.planState.textContent =
      planState();


    ui.timeStart.textContent =
      shortFmt(
        a
      );


    ui.timeEnd.textContent =
      shortFmt(
        b
      );


    ui.timeMiddle.textContent =
      planState() ===
      "LOCKED"
        ? "LOCKED · view only"
        : planState() ===
          "DONE"
          ? "DONE · reviewed"
          : "NOT DONE · editable";


    ui.timeInput.value =
      inputFmt(
        state.now
      );


    ui.timeSlider.value =
      Math.round(
        (
          state.now -
          a
        ) /
        (
          b -
          a
        ) *
        2000
      );

  }


  function setTime(
    ms
  ) {

    state.now =
      clamp(

        ms,

        Date.parse(
          plan.blockStart
        ),

        Date.parse(
          plan.blockEnd
        )

      );


    syncTimeline();

    updateObjects();

    updateInspect();

    render();

  }


  /*
      =========================================================
      REAL EUROPE
      =========================================================
  */


  async function fetchJSON(
    urls
  ) {

    let last;


    for (
      const url of
      urls
    ) {

      try {

        const r =
          await fetch(
            url,
            {
              cache:
                "force-cache"
            }
          );


        if (
          !r.ok
        ) {

          throw new Error(
            r.status +
            " " +
            r.statusText
          );

        }


        return await r.json();

      }
      catch (
        e
      ) {

        last =
          e;


        console.warn(
          "Geography source failed",
          url,
          e
        );

      }

    }


    throw (
      last ||
      new Error(
        "No geography source available"
      )
    );

  }


  function drawRing(
    ring
  ) {

    if (
      !ring ||
      ring.length <
      2
    ) {

      return;

    }


    landCtx.moveTo(

      lonX(
        ring[0][0],
        landCanvas.width
      ),

      latY(
        ring[0][1],
        landCanvas.height
      )

    );


    for (
      let i = 1;
      i <
      ring.length;
      i++
    ) {

      landCtx.lineTo(

        lonX(
          ring[i][0],
          landCanvas.width
        ),

        latY(
          ring[i][1],
          landCanvas.height
        )

      );

    }


    landCtx.closePath();

  }


  function buildLandMask(
    geo
  ) {

    landCtx.clearRect(
      0,
      0,
      landCanvas.width,
      landCanvas.height
    );


    landCtx.fillStyle =
      "#fff";


    landCtx.beginPath();


    for (
      const f of
      geo.features ||
      []
    ) {

      const g =
        f.geometry;


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

          drawRing(
            ring
          );

        }

      }


      if (
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

            drawRing(
              ring
            );

          }

        }

      }

    }


    landCtx.fill(
      "evenodd"
    );


    state.landData =
      landCtx.getImageData(
        0,
        0,
        landCanvas.width,
        landCanvas.height
      ).data;


    state.geoReady =
      true;

  }


  function isLand(
    lat,
    lon
  ) {

    if (
      !state.geoReady ||
      !state.landData
    ) {

      return false;

    }


    const x =
      clamp(

        Math.floor(
          (
            lon -
            B.west
          ) /
          (
            B.east -
            B.west
          ) *
          landCanvas.width
        ),

        0,

        landCanvas.width -
        1

      );


    const y =
      clamp(

        Math.floor(
          (
            B.north -
            lat
          ) /
          (
            B.north -
            B.south
          ) *
          landCanvas.height
        ),

        0,

        landCanvas.height -
        1

      );


    return (
      state.landData[
        (
          y *
          landCanvas.width +
          x
        ) *
        4 +
        3
      ] >
      0
    );

  }


  /*
      =========================================================
      TERRAIN
      =========================================================
  */


  function tilePos(
    lat,
    lon,
    z
  ) {

    const n =
      2 **
      z;


    const la =
      rad(
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
            la
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


  async function blobImageData(
    blob
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

      return true;

    }


    for (
      const tpl of
      TERRAIN_HOSTS
    ) {

      const url =
        tpl
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


      try {

        const r =
          await fetch(
            url,
            {
              cache:
                "force-cache"
            }
          );


        if (
          !r.ok
        ) {

          throw new Error(
            String(
              r.status
            )
          );

        }


        state.terrainTiles.set(

          key,

          await blobImageData(
            await r.blob()
          )

        );


        return true;

      }
      catch (
        e
      ) {

        console.warn(
          "Terrain tile failed",
          url,
          e
        );

      }

    }


    return false;

  }


  async function loadTerrain() {

    const nw =
      tilePos(
        B.north,
        B.west,
        TERRAIN_Z
      );


    const se =
      tilePos(
        B.south,
        B.east,
        TERRAIN_Z
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
            TERRAIN_Z,
            x,
            y
          )
        );

      }

    }


    const results =
      await Promise.all(
        jobs
      );


    state.terrainReady =
      results.some(
        Boolean
      );


    return results.filter(
      Boolean
    ).length;

  }


  function elevationAt(
    lat,
    lon
  ) {

    if (
      !state.terrainReady ||
      !isLand(
        lat,
        lon
      )
    ) {

      return 0;

    }


    const t =
      tilePos(
        lat,
        lon,
        TERRAIN_Z
      );


    const data =
      state.terrainTiles.get(
        TERRAIN_Z +
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


    const d =
      data.data;


    /*
        Terrarium elevation encoding.
    */

    return (
      d[i] *
      256 +
      d[
        i +
        1
      ] +
      d[
        i +
        2
      ] /
      256 -
      32768
    );

  }


  /*
      =========================================================
      TERRAIN MAP
      =========================================================
  */


  function buildBase() {

    const W =
      780;


    const H =
      440;


    const c =
      state.baseCanvas;


    c.width =
      W;


    c.height =
      H;


    const cctx =
      c.getContext(
        "2d"
      );


    const img =
      cctx.createImageData(
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
        yLat(
          y +
          .5,
          H
        );


      for (
        let x = 0;
        x <
        W;
        x++
      ) {

        const lon =
          xLon(
            x +
            .5,
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


        let r =
          18;


        let g =
          48;


        let b =
          65;


        if (
          land
        ) {

          const h =
            Math.max(
              0,
              elevationAt(
                lat,
                lon
              )
            );


          if (
            h <
            150
          ) {

            r =
              63;

            g =
              94;

            b =
              62;

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
                63,
                111,
                t
              );


            g =
              lerp(
                94,
                105,
                t
              );


            b =
              lerp(
                62,
                70,
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
                145,
                t
              );


            g =
              lerp(
                105,
                128,
                t
              );


            b =
              lerp(
                70,
                100,
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
                145,
                180,
                t
              );


            g =
              lerp(
                128,
                165,
                t
              );


            b =
              lerp(
                100,
                145,
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
                180,
                235,
                t
              );


            g =
              lerp(
                165,
                232,
                t
              );


            b =
              lerp(
                145,
                228,
                t
              );

          }

        }


        img.data[i] =
          r |
          0;


        img.data[
          i +
          1
        ] =
          g |
          0;


        img.data[
          i +
          2
        ] =
          b |
          0;


        img.data[
          i +
          3
        ] =
          255;

      }

    }


    cctx.putImageData(
      img,
      0,
      0
    );

  }


  /*
      =========================================================
      BASIC CLIMATE
      =========================================================
  */


  function baselineTempNoElev(
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
      .46 *
      (
        lat -
        35
      ) +
      (
        land
          ? 0
          : .7
      );


    if (
      land &&
      lon <
      2 &&
      lat >
      48
    ) {

      annual +=
        1.1;

    }


    if (
      land &&
      lat <
      45
    ) {

      annual +=
        1.0;

    }


    const continental =
      land
        ? clamp(
            (
              lon +
              5
            ) /
            38,
            .08,
            .95
          )
        : .05;


    const amp =
      land
        ? (
            6 +
            continental *
            8 +
            Math.max(
              0,
              lat -
              48
            ) *
            .06
          )
        : 5;


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


    const solar =
      (
        (
          d.getUTCHours() +
          d.getUTCMinutes() /
          60 +
          lon /
          15
        ) %
        24 +
        24
      ) %
      24;


    const diurnal =
      (
        land
          ? (
              1.7 +
              continental *
              2.4
            )
          : .6
      ) *
      Math.cos(
        2 *
        Math.PI *
        (
          solar -
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
      baselineTempNoElev(
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


    let c =
      42 +
      17 *
      winter;


    if (
      !isLand(
        lat,
        lon
      )
    ) {

      c +=
        8;

    }


    if (
      lon <
      2 &&
      lat >
      48
    ) {

      c +=
        7;

    }


    if (
      lat <
      45 &&
      lon >
      -8
    ) {

      c -=
        13;

    }


    return clamp(
      c,
      12,
      90
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
        ? .48
        : .73;


    const mo =
      new Date(
        ms
      ).getUTCMonth();


    if (
      lat <
      45 &&
      mo >=
      4 &&
      mo <=
      8
    ) {

      m -=
        .08;

    }


    if (
      lon <
      2 &&
      lat >
      48
    ) {

      m +=
        .05;

    }


    return clamp(
      m,
      .25,
      .84
    );

  }


  /*
      =========================================================
      AIR SOURCES
      =========================================================
  */


  function airAnomaly(
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


    return (

      {

        arctic:
          lerp(
            -5.5,
            -13,
            winter
          ),

        polar_maritime:
          lerp(
            -2.5,
            -6,
            winter
          ),

        atlantic:
          lerp(
            -2,
            3,
            winter
          ),

        continental:
          lerp(
            4.5,
            -7,
            winter
          ),

        mediterranean:
          lerp(
            5,
            7,
            winter
          ),

        tropical:
          lerp(
            9,
            11.5,
            winter
          )

      }[type] ??
      0

    );

  }


  const airMoisture =
    t =>
      (

        {
          arctic: .22,
          polar_maritime: .62,
          atlantic: .78,
          continental: .26,
          mediterranean: .68,
          tropical: .32
        }[t] ??

        .5

      );


  const intensity =
    n =>
      (

        {
          gentle: .72,
          normal: 1,
          strong: 1.28,
          extreme: 1.55
        }[n] ??

        1

      );


  const airWind =
    n =>
      (

        {
          gentle: 6,
          normal: 9,
          strong: 13,
          extreme: 18
        }[n] ??

        9

      );


  const pStrength =
    n =>
      (

        {
          weak: 9,
          normal: 18,
          strong: 28,
          extreme: 38
        }[n] ??

        18

      );


  /*
      =========================================================
      CURVED PATH
      =========================================================
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
      .5 *
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


  function pathPos(
    path,
    u
  ) {

    if (
      !path?.length
    ) {

      return {
        lat: 50,
        lon: 10
      };

    }


    if (
      path.length ===
      1
    ) {

      return path[0];

    }


    u =
      clamp(
        u,
        0,
        1
      );


    const s =
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
          s
        )
      );


    const t =
      s -
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
      pathPos(
        path,
        clamp(
          u -
          .008,
          0,
          1
        )
      );


    const b =
      pathPos(
        path,
        clamp(
          u +
          .008,
          0,
          1
        )
      );


    const v =
      vecKm(
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
    o,
    ms
  ) {

    const a =
      Date.parse(
        o.startTime
      );


    const b =
      Date.parse(
        o.endTime
      );


    return (
      ms >=
      a &&
      ms <=
      b
    );

  }


  function progress(
    o,
    ms
  ) {

    return smooth(

      (
        ms -
        Date.parse(
          o.startTime
        )
      ) /

      Math.max(
        1,
        Date.parse(
          o.endTime
        ) -
        Date.parse(
          o.startTime
        )
      )

    );

  }


  function radial(
    d,
    r
  ) {

    const x =
      d /
      Math.max(
        1,
        r
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


  function recentPathDistance(
    o,
    lat,
    lon,
    u
  ) {

    let best =
      Infinity;


    const a =
      Math.max(
        0,
        u -
        .24
      );


    const b =
      Math.min(
        1,
        u +
        .04
      );


    for (
      let i = 0;
      i <=
      14;
      i++
    ) {

      const p =
        pathPos(
          o.path,
          lerp(
            a,
            b,
            i /
            14
          )
        );


      best =
        Math.min(

          best,

          distKm(
            lat,
            lon,
            p.lat,
            p.lon
          )

        );

    }


    return best;

  }


  /*
      =========================================================
      MOISTURE PICKUP

      Crossing sea automatically moistens the air.
      Long journeys over land gradually dry it.
      =========================================================
  */


  function moistureAlongPath(
    o,
    u
  ) {

    let m =
      airMoisture(
        o.airType
      );


    let prev =
      pathPos(
        o.path,
        0
      );


    const steps =
      Math.max(
        2,
        Math.round(
          28 *
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
        pathPos(
          o.path,
          u *
          i /
          steps
        );


      const d =
        distKm(
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

        m =
          lerp(

            m,

            .96,

            1 -
            Math.exp(
              -d /
              240
            )

          );

      }
      else {

        m =
          lerp(

            m,

            .36,

            (
              1 -
              Math.exp(
                -d /
                800
              )
            ) *
            .32

          );

      }


      prev =
        p;

    }


    return clamp(
      m,
      .08,
      .97
    );

  }


  /*
      =========================================================
      ATMOSPHERIC FIELD
      =========================================================
  */


  function core(
    lat,
    lon,
    ms
  ) {

    const base =
      baselineTemp(
        lat,
        lon,
        ms
      );


    let temp =
      base;


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


    let u =
      4;


    let v =
      0;


    let lift =
      0;


    for (
      const o of
      plan.objects
    ) {

      if (
        !active(
          o,
          ms
        )
      ) {

        continue;

      }


      if (
        o.kind ===
        "air"
      ) {

        const pr =
          progress(
            o,
            ms
          );


        const d =
          recentPathDistance(
            o,
            lat,
            lon,
            pr
          );


        const w =
          radial(
            d,
            o.widthKm
          );


        if (!w) {

          continue;

        }


        const m =
          moistureAlongPath(
            o,
            pr
          );


        const tan =
          pathTangent(
            o.path,
            pr
          );


        const spd =
          airWind(
            o.intensity
          );


        temp +=
          airAnomaly(
            o.airType,
            ms
          ) *
          intensity(
            o.intensity
          ) *
          w;


        moisture =
          lerp(
            moisture,
            m,
            w *
            .9
          );


        cloud +=
          Math.max(
            0,
            m -
            .54
          ) *
          45 *
          w;


        u +=
          tan.x *
          spd *
          w;


        v +=
          tan.y *
          spd *
          w;


        if (
          isLand(
            lat,
            lon
          ) &&
          m >
          .69
        ) {

          lift +=
            (
              m -
              .69
            ) *
            1.05 *
            w;

        }


        const head =
          pathPos(
            o.path,
            pr
          );


        const hd =
          distKm(
            lat,
            lon,
            head.lat,
            head.lon
          );


        if (
          hd <
          o.widthKm *
          .7
        ) {

          lift +=
            .10 *
            w;

        }

      }
      else if (
        o.kind ===
        "high" ||
        o.kind ===
        "low"
      ) {

        const d =
          distKm(
            lat,
            lon,
            o.lat,
            o.lon
          );


        const w =
          radial(
            d,
            o.radiusKm ||
            900
          );


        if (!w) {

          continue;

        }


        const s =
          pStrength(
            o.strength
          );


        const sg =
          o.kind ===
          "high"
            ? 1
            : -1;


        pressure +=
          sg *
          s *
          w;


        cloud +=
          (
            o.kind ===
            "high"
              ? -25
              : 30
          ) *
          w;


        lift +=
          (
            o.kind ===
            "high"
              ? -.5
              : 1.05
          ) *
          w;


        const q =
          vecKm(
            o.lat,
            o.lon,
            lat,
            lon
          );


        const l =
          Math.hypot(
            q.x,
            q.y
          ) ||
          1;


        const nx =
          q.x /
          l;


        const ny =
          q.y /
          l;


        const tx =
          o.kind ===
          "low"
            ? -ny
            : ny;


        const ty =
          o.kind ===
          "low"
            ? nx
            : -nx;


        const spd =
          s *
          .34 *
          w;


        u +=
          tx *
          spd;


        v +=
          ty *
          spd;

      }

    }


    cloud =
      clamp(

        cloud +

        Math.max(
          0,
          moisture -
          .60
        ) *
        20 +

        Math.max(
          0,
          lift
        ) *
        13,

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
        base,

      temperatureC:
        temp,

      anomalyC:
        temp -
        base,

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
        u,

      vWind:
        v,

      windSpeed:
        Math.hypot(
          u,
          v
        ),

      synopticLift:
        lift

    };

  }


  /*
      =========================================================
      NATURAL PRECIPITATION

      There is no precipitation placement tool.

      It is generated from:
      moisture
      + convergence
      + low pressure
      + terrain uplift
      + limited convection
      =========================================================
  */


  function precip(
    lat,
    lon,
    ms,
    c0
  ) {

    const c =
      c0 ||
      core(
        lat,
        lon,
        ms
      );


    const dLat =
      .34;


    const dLon =
      .44;


    const w =
      core(
        lat,
        lon -
        dLon,
        ms
      );


    const e =
      core(
        lat,
        lon +
        dLon,
        ms
      );


    const s =
      core(
        lat -
        dLat,
        lon,
        ms
      );


    const n =
      core(
        lat +
        dLat,
        lon,
        ms
      );


    const div =
      (
        e.uWind -
        w.uWind
      ) /
      (
        2 *
        dLon *
        kmLon(
          lat
        )
      ) +

      (
        n.vWind -
        s.vWind
      ) /
      (
        2 *
        dLat *
        KM_PER_DEG
      );


    const convergence =
      clamp(
        -div *
        25,
        0,
        1.8
      );


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


      const sample =
        km =>
          elevationAt(

            lat -
            uy *
            km /
            KM_PER_DEG,

            lon -
            ux *
            km /
            kmLon(
              lat
            )

          );


      const rise =
        Math.max(

          0,

          c.elevationM -

          Math.min(
            sample(
              80
            ),
            sample(
              160
            )
          )

        );


      oro =
        clamp(
          rise /
          620,
          0,
          1.8
        ) *
        clamp(
          c.windSpeed /
          8,
          .3,
          1.8
        );

    }


    const convection =
      (
        c.temperatureC >
        18 &&
        c.moisture >
        .72
      )

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
              .72
            ) /
            .22,
            0,
            1
          ) *
          .75

        : 0;


    const lift =
      Math.max(

        0,

        c.synopticLift +

        1.15 *
        convergence +

        oro +

        convection

      );


    const moist =
      clamp(
        (
          c.moisture -
          .55
        ) /
        .4,
        0,
        1
      );


    const cloud =
      clamp(
        (
          c.cloud -
          58
        ) /
        42,
        0,
        1
      );


    let rate =
      moist *
      cloud *
      (
        .10 +
        lift *
        3.2
      );


    if (
      rate <
      .05 &&
      c.moisture >
      .83 &&
      c.cloud >
      90 &&
      lift >
      .04
    ) {

      rate =
        .07 +
        (
          c.moisture -
          .83
        ) *
        1.4;

    }


    if (
      rate <
      .04
    ) {

      rate =
        0;

    }


    let phase =
      "none";


    if (
      rate >
      0
    ) {

      phase =
        c.temperatureC <=
        .2
          ? "snow"
          : c.temperatureC <=
            1
            ? "wet snow"
            : c.temperatureC <=
              2.2
              ? "sleet"
              : "rain";

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


  function weather(
    lat,
    lon,
    ms,
    withSnow =
      false
  ) {

    const c =
      core(
        lat,
        lon,
        ms
      );


    const p =
      precip(
        lat,
        lon,
        ms,
        c
      );


    let snow =
      0;


    if (
      withSnow &&
      c.land
    ) {

      for (
        let t =
          ms -
          72 *
          HOUR;

        t <=
        ms;

        t +=
        3 *
        HOUR
      ) {

        const cc =
          core(
            lat,
            lon,
            t
          );


        const pp =
          precip(
            lat,
            lon,
            t,
            cc
          );


        const amt =
          pp.rate *
          3;


        if (
          pp.phase ===
          "snow"
        ) {

          snow +=
            amt *
            .9;

        }
        else if (
          pp.phase ===
          "wet snow"
        ) {

          snow +=
            amt *
            .5;

        }
        else if (
          pp.phase ===
          "sleet"
        ) {

          snow +=
            amt *
            .15;

        }
        else if (
          pp.phase ===
          "rain"
        ) {

          snow -=
            amt *
            .18;

        }


        if (
          cc.temperatureC >
          0
        ) {

          snow -=
            (
              .04 *
              cc.temperatureC +
              .003 *
              cc.temperatureC *
              cc.temperatureC
            ) *
            3;

        }


        snow =
          Math.max(
            0,
            snow *
            .998
          );

      }

    }


    return {

      ...c,
      ...p,

      snowDepthCm:
        snow

    };

  }


  /*
      =========================================================
      OVERLAYS
      =========================================================
  */


  function overlayColor(
    layer,
    w
  ) {

    if (
      layer ===
      "temperature"
    ) {

      const t =
        clamp(
          (
            w.temperatureC +
            20
          ) /
          55,
          0,
          1
        );


      const mid =
        1 -
        Math.abs(
          t -
          .5
        ) *
        2;


      return (
        "rgba(" +
        Math.round(
          45 +
          210 *
          t
        ) +
        "," +
        Math.round(
          90 +
          100 *
          mid
        ) +
        "," +
        Math.round(
          235 -
          205 *
          t
        ) +
        ",.52)"
      );

    }


    if (
      layer ===
      "anomaly"
    ) {

      const a =
        clamp(
          Math.abs(
            w.anomalyC
          ) /
          14,
          0,
          1
        );


      if (
        Math.abs(
          w.anomalyC
        ) <
        .15
      ) {

        return "rgba(180,180,180,.03)";

      }


      return (
        w.anomalyC <
        0

          ? "rgba(45,150,245," +
            (
              .08 +
              .58 *
              a
            ) +
            ")"

          : "rgba(245,95,45," +
            (
              .08 +
              .58 *
              a
            ) +
            ")"
      );

    }


    if (
      layer ===
      "moisture"
    ) {

      const a =
        clamp(
          (
            w.moisture -
            .3
          ) /
          .65,
          0,
          1
        );


      return (
        "rgba(45,155,230," +
        (
          .10 +
          .48 *
          a
        ) +
        ")"
      );

    }


    if (
      layer ===
      "precip"
    ) {

      if (
        !w.rate
      ) {

        return null;

      }


      const a =
        .20 +
        .68 *
        clamp(
          Math.log1p(
            w.rate
          ) /
          Math.log(
            8
          ),
          0,
          1
        );


      if (
        w.phase ===
        "snow" ||
        w.phase ===
        "wet snow"
      ) {

        return (
          "rgba(242,248,255," +
          a +
          ")"
        );

      }


      if (
        w.phase ===
        "sleet"
      ) {

        return (
          "rgba(155,215,240," +
          a +
          ")"
        );

      }


      return (
        "rgba(30,105,235," +
        a +
        ")"
      );

    }


    return null;

  }


  function drawBase() {

    ctx.clearRect(
      0,
      0,
      state.w,
      state.h
    );


    ctx.fillStyle =
      "#12303e";


    ctx.fillRect(
      0,
      0,
      state.w,
      state.h
    );


    if (
      state.geoReady
    ) {

      ctx.drawImage(
        state.baseCanvas,
        0,
        0,
        state.w,
        state.h
      );

    }
    else {

      ctx.fillStyle =
        "#dfe8ed";


      ctx.font =
        "700 18px system-ui";


      ctx.textAlign =
        "center";


      ctx.fillText(
        "LOADING REAL EUROPE…",
        state.w /
        2,
        state.h /
        2
      );

    }

  }


  function drawGrid() {

    ctx.save();


    ctx.strokeStyle =
      "rgba(235,242,246,.12)";


    ctx.fillStyle =
      "rgba(235,242,246,.55)";


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
        lonX(
          lon
        );


      ctx.beginPath();


      ctx.moveTo(
        x,
        0
      );


      ctx.lineTo(
        x,
        state.h
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
        latY(
          lat
        );


      ctx.beginPath();


      ctx.moveTo(
        0,
        y
      );


      ctx.lineTo(
        state.w,
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
      state.layer ===
      "precip"
        ? 44
        : 58;


    const rows =
      Math.round(
        cols *
        (
          B.north -
          B.south
        ) /
        (
          B.east -
          B.west
        )
      );


    const cw =
      state.w /
      cols;


    const ch =
      state.h /
      rows;


    for (
      let gy = 0;
      gy <
      rows;
      gy++
    ) {

      const lat =
        yLat(
          (
            gy +
            .5
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
          xLon(
            (
              gx +
              .5
            ) *
            cw
          );


        const w =
          state.layer ===
          "precip"

            ? weather(
                lat,
                lon,
                state.now,
                false
              )

            : core(
                lat,
                lon,
                state.now
              );


        const c =
          overlayColor(
            state.layer,
            w
          );


        if (
          c
        ) {

          ctx.fillStyle =
            c;


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

    }


    ctx.fillStyle =
      "rgba(5,10,14,.78)";


    ctx.fillRect(
      10,
      10,
      190,
      38
    );


    ctx.fillStyle =
      "#eef4f7";


    ctx.font =
      "700 10px system-ui";


    ctx.fillText(

      state.layer ===
      "precip"
        ? "PRECIPITATION · CALCULATED"
        : state.layer.toUpperCase(),

      18,
      25

    );


    ctx.fillStyle =
      "#b6c5ce";


    ctx.font =
      "9px system-ui";


    ctx.fillText(

      state.layer ===
      "precip"
        ? "moisture + lift + terrain"
        : "derived field",

      18,
      40

    );

  }


  /*
      =========================================================
      DRAW SYSTEMS
      =========================================================
  */


  function airName(
    t
  ) {

    return (

      {
        arctic: "ARCTIC",
        polar_maritime: "POLAR MARITIME",
        atlantic: "ATLANTIC",
        continental: "CONTINENTAL",
        mediterranean: "MEDITERRANEAN",
        tropical: "TROPICAL"
      }[t] ||

      "AIR"

    );

  }


  function airColor(
    t
  ) {

    return (

      {
        arctic: "#b7e8ff",
        polar_maritime: "#8cccf1",
        atlantic: "#79b7dc",
        continental: "#e4d39a",
        mediterranean: "#efb36d",
        tropical: "#ef8c50"
      }[t] ||

      "#fff"

    );

  }


  function arrowHead(
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


    const l =
      Math.hypot(
        dx,
        dy
      ) ||
      1;


    const ux =
      dx /
      l;


    const uy =
      dy /
      l;


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


  function drawAir(
    o
  ) {

    const color =
      airColor(
        o.airType
      );


    const samples =
      Math.max(
        35,
        o.path.length *
        14
      );


    ctx.save();


    ctx.globalAlpha =
      active(
        o,
        state.now
      )
        ? 1
        : .25;


    ctx.strokeStyle =
      color;


    ctx.lineWidth =
      state.selectedId ===
      o.id
        ? 4
        : 2.3;


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
        pathPos(
          o.path,
          i /
          samples
        );


      const x =
        lonX(
          p.lon
        );


      const y =
        latY(
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
        prev &&
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
        0
      ) {

        arrowHead(
          prev.x,
          prev.y,
          x,
          y,
          color
        );

      }


      prev = {
        x,
        y
      };

    }


    ctx.stroke();


    if (
      active(
        o,
        state.now
      )
    ) {

      const pr =
        progress(
          o,
          state.now
        );


      const h =
        pathPos(
          o.path,
          pr
        );


      const x =
        lonX(
          h.lon
        );


      const y =
        latY(
          h.lat
        );


      const m =
        moistureAlongPath(
          o,
          pr
        );


      const a =
        airAnomaly(
          o.airType,
          state.now
        ) *
        intensity(
          o.intensity
        );


      ctx.globalAlpha =
        .13;


      ctx.fillStyle =
        color;


      const rx =
        Math.abs(
          lonX(
            h.lon +
            o.widthKm /
            kmLon(
              h.lat
            )
          ) -
          x
        );


      const ry =
        Math.abs(
          latY(
            h.lat +
            o.widthKm /
            KM_PER_DEG
          ) -
          y
        );


      ctx.beginPath();


      ctx.ellipse(
        x,
        y,
        Math.max(
          12,
          rx
        ),
        Math.max(
          12,
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
        "rgba(6,11,15,.82)";


      ctx.fillRect(
        x -
        73,
        y -
        29,
        146,
        40
      );


      ctx.textAlign =
        "center";


      ctx.fillStyle =
        color;


      ctx.font =
        "700 10px system-ui";


      ctx.fillText(

        airName(
          o.airType
        ) +
        " " +
        sign1(
          a
        ) +
        a.toFixed(
          1
        ) +
        "°",

        x,
        y -
        14

      );


      ctx.fillStyle =
        "#edf3f6";


      ctx.font =
        "9px system-ui";


      ctx.fillText(

        "moisture " +
        Math.round(
          m *
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
    o
  ) {

    if (
      !active(
        o,
        state.now
      )
    ) {

      return;

    }


    const x =
      lonX(
        o.lon
      );


    const y =
      latY(
        o.lat
      );


    const high =
      o.kind ===
      "high";


    const color =
      high
        ? "#a9e1f5"
        : "#f3a0a0";


    ctx.save();


    ctx.fillStyle =
      "rgba(6,11,15,.84)";


    ctx.strokeStyle =
      color;


    ctx.lineWidth =
      state.selectedId ===
      o.id
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
      color;


    ctx.textAlign =
      "center";


    ctx.textBaseline =
      "middle";


    ctx.font =
      "800 22px system-ui";


    ctx.fillText(
      high
        ? "H"
        : "L",
      x,
      y -
      2
    );


    ctx.fillStyle =
      "#eef4f7";


    ctx.font =
      "9px system-ui";


    ctx.fillText(

      Math.round(
        1014 +
        pStrength(
          o.strength
        ) *
        (
          high
            ? 1
            : -1
        )
      ) +
      " hPa",

      x,
      y +
      31

    );


    ctx.restore();

  }


  function drawSystems() {

    for (
      const o of
      plan.objects
    ) {

      if (
        o.kind ===
        "air"
      ) {

        drawAir(
          o
        );

      }

    }


    for (
      const o of
      plan.objects
    ) {

      if (
        o.kind ===
        "high" ||
        o.kind ===
        "low"
      ) {

        drawPressure(
          o
        );

      }

    }

  }


  function drawDraft() {

    if (
      !state.drawing ||
      !state.draftPath.length
    ) {

      return;

    }


    ctx.save();


    ctx.strokeStyle =
      "#ffe173";


    ctx.fillStyle =
      "#ffe173";


    ctx.lineWidth =
      2.5;


    ctx.setLineDash(
      [
        7,
        5
      ]
    );


    ctx.beginPath();


    state.draftPath.forEach(
      (
        p,
        i
      ) => {

        const x =
          lonX(
            p.lon
          );


        const y =
          latY(
            p.lat
          );


        if (
          i
        ) {

          ctx.lineTo(
            x,
            y
          );

        }
        else {

          ctx.moveTo(
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
      state.draftPath
    ) {

      ctx.beginPath();


      ctx.arc(
        lonX(
          p.lon
        ),
        latY(
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


  function drawInspect() {

    if (
      !state.inspect
    ) {

      return;

    }


    const x =
      lonX(
        state.inspect.lon
      );


    const y =
      latY(
        state.inspect.lat
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

    drawOverlay();

    drawGrid();

    drawSystems();

    drawDraft();

    drawInspect();

  }


  function resize() {

    const r =
      ui.canvas.getBoundingClientRect();


    state.w =
      Math.max(
        320,
        Math.round(
          r.width
        )
      );


    state.h =
      Math.max(
        360,
        Math.round(
          r.height
        )
      );


    state.dpr =
      Math.min(
        2,
        Math.max(
          1,
          window.devicePixelRatio ||
          1
        )
      );


    ui.canvas.width =
      Math.round(
        state.w *
        state.dpr
      );


    ui.canvas.height =
      Math.round(
        state.h *
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
      =========================================================
      TOOLS
      =========================================================
  */


  function setTool(
    tool
  ) {

    if (
      state.drawing &&
      tool !==
      "air"
    ) {

      cancelAir(
        false
      );

    }


    state.tool =
      tool;


    document
      .querySelectorAll(
        "[data-tool]"
      )
      .forEach(
        b =>
          b.classList.toggle(
            "active",
            b.dataset.tool ===
            tool
          )
      );


    if (
      tool ===
      "inspect"
    ) {

      ui.mapHint.textContent =
        "Inspect: click anywhere for calculated weather.";

    }


    if (
      tool ===
      "high"
    ) {

      ui.mapHint.textContent =
        "High: click to place the centre.";

    }


    if (
      tool ===
      "low"
    ) {

      ui.mapHint.textContent =
        "Low: click to place the centre.";

    }


    if (
      tool ===
      "air"
    ) {

      startAir();

    }

  }


  function startAir() {

    if (
      isLocked(
        state.now
      )
    ) {

      msg(
        "This time is locked. Move the slider into editable time first."
      );


      setTool(
        "inspect"
      );


      return;

    }


    state.drawing =
      true;


    state.draftPath =
      [];


    ui.finishAir.hidden =
      false;


    ui.cancelAir.hidden =
      false;


    ui.finishAir.disabled =
      true;


    ui.mapHint.textContent =
      "Draw Air: click a source and then any bends you want. Double-click or press Finish Air when done.";


    render();

  }


  function cancelAir(
    switchTool =
      true
  ) {

    state.drawing =
      false;


    state.draftPath =
      [];


    ui.finishAir.hidden =
      true;


    ui.cancelAir.hidden =
      true;


    if (
      switchTool
    ) {

      state.tool =
        "inspect";


      document
        .querySelectorAll(
          "[data-tool]"
        )
        .forEach(
          b =>
            b.classList.toggle(
              "active",
              b.dataset.tool ===
              "inspect"
            )
        );


      ui.mapHint.textContent =
        "Inspect: click anywhere for calculated weather.";

    }


    render();

  }


  function finishAir() {

    if (
      state.draftPath.length <
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
      HOUR;


    const o = {

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
        state.draftPath.map(
          p => ({
            lat: p.lat,
            lon: p.lon
          })
        )

    };


    plan.objects.push(
      o
    );


    state.selectedId =
      o.id;


    saveSilent();

    cancelAir(
      true
    );

    updateObjects();

    updateInspect();

    render();


    msg(
      "Air stream created. Scrub the slider and switch to Temperature or Precipitation."
    );

  }


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
        "This time is locked."
      );


      return;

    }


    const duration =
      Number(
        ui.pressureDuration.value
      ) *
      HOUR;


    const o = {

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
      o
    );


    state.selectedId =
      o.id;


    saveSilent();

    setTool(
      "inspect"
    );

    updateObjects();

    updateInspect();

    render();


    msg(
      kind ===
      "high"
        ? "High placed."
        : "Low placed."
    );

  }


  function nearestPressure(
    x,
    y
  ) {

    let best =
      null;


    let bd =
      26;


    for (
      const o of
      plan.objects
    ) {

      if (
        (
          o.kind !==
          "high" &&
          o.kind !==
          "low"
        ) ||
        !active(
          o,
          state.now
        )
      ) {

        continue;

      }


      const d =
        Math.hypot(
          lonX(
            o.lon
          ) -
          x,
          latY(
            o.lat
          ) -
          y
        );


      if (
        d <
        bd
      ) {

        bd =
          d;


        best =
          o;

      }

    }


    return best;

  }


  function mapClick(
    e
  ) {

    if (
      !state.geoReady
    ) {

      return;

    }


    const p =
      canvasPoint(
        e
      );


    const lat =
      clamp(
        yLat(
          p.y
        ),
        B.south,
        B.north
      );


    const lon =
      clamp(
        xLon(
          p.x
        ),
        B.west,
        B.east
      );


    if (
      state.drawing
    ) {

      state.draftPath.push({
        lat,
        lon
      });


      ui.finishAir.disabled =
        state.draftPath.length <
        2;


      render();


      msg(
        state.draftPath.length +
        " path point" +
        (
          state.draftPath.length ===
          1
            ? ""
            : "s"
        ) +
        "."
      );


      return;

    }


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


    state.inspect = {
      lat,
      lon
    };


    state.selectedId =
      null;


    updateObjects();

    updateInspect();

    render();

  }


  function pointerMove(
    e
  ) {

    if (
      !state.geoReady
    ) {

      return;

    }


    const p =
      canvasPoint(
        e
      );


    const lat =
      clamp(
        yLat(
          p.y
        ),
        B.south,
        B.north
      );


    const lon =
      clamp(
        xLon(
          p.x
        ),
        B.west,
        B.east
      );


    const land =
      isLand(
        lat,
        lon
      );


    const h =
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
          ? h +
            " m"
          : "SEA"
      );

  }


  /*
      =========================================================
      INSPECTION
      =========================================================
  */


  function windName(
    from
  ) {

    return [

      "N",
      "NE",
      "E",
      "SE",
      "S",
      "SW",
      "W",
      "NW"

    ][

      Math.round(
        (
          (
            from %
            360
          ) +
          360
        ) %
        360 /
        45
      ) %
      8

    ];

  }


  function updateInspect() {

    if (
      !state.geoReady ||
      !state.inspect
    ) {

      return;

    }


    const w =
      weather(
        state.inspect.lat,
        state.inspect.lon,
        state.now,
        true
      );


    ui.where.textContent =
      state.inspect.lat.toFixed(
        2
      ) +
      "°N, " +
      (
        state.inspect.lon >=
        0
          ? state.inspect.lon.toFixed(
              2
            ) +
            "°E"
          : Math.abs(
              state.inspect.lon
            ).toFixed(
              2
            ) +
            "°W"
      ) +
      " · " +
      fmt(
        state.now
      );


    ui.wxTemp.textContent =
      w.temperatureC.toFixed(
        1
      ) +
      " °C";


    ui.wxAnom.textContent =
      sign1(
        w.anomalyC
      ) +
      w.anomalyC.toFixed(
        1
      ) +
      " °C";


    ui.wxPressure.textContent =
      Math.round(
        w.pressureHpa
      ) +
      " hPa";


    const toward =
      deg(
        Math.atan2(
          w.uWind,
          w.vWind
        )
      );


    const from =
      toward +
      180;


    ui.wxWind.textContent =
      windName(
        from
      ) +
      " " +
      w.windSpeed.toFixed(
        1
      ) +
      " m/s";


    ui.wxCloud.textContent =
      Math.round(
        w.cloud
      ) +
      "%";


    ui.wxMoisture.textContent =
      Math.round(
        w.moisture *
        100
      ) +
      "%";


    ui.wxPrecip.textContent =
      w.rate

        ? w.phase.replace(
            /^./,
            c =>
              c.toUpperCase()
          ) +
          " · " +
          w.rate.toFixed(
            2
          ) +
          " mm/h"

        : "Dry";


    ui.wxSnow.textContent =
      w.snowDepthCm <
      .1
        ? "0 cm"
        : w.snowDepthCm.toFixed(
            1
          ) +
          " cm";


    ui.wxElevation.textContent =
      w.land
        ? Math.round(
            w.elevationM
          ) +
          " m"
        : "Sea";

  }


  /*
      =========================================================
      ACTIVE OBJECTS
      =========================================================
  */


  function objectName(
    o
  ) {

    return (
      o.kind ===
      "air"

        ? airName(
            o.airType
          ) +
          " air"

        : o.kind ===
          "high"

          ? "High pressure"

          : "Low pressure"
    );

  }


  function updateObjects() {

    ui.objects.innerHTML =
      "";


    const arr =
      plan.objects.filter(
        o =>
          active(
            o,
            state.now
          )
      );


    if (
      !arr.length
    ) {

      const d =
        document.createElement(
          "div"
        );


      d.className =
        "help";


      d.textContent =
        "None active at this time.";


      ui.objects.appendChild(
        d
      );

    }


    for (
      const o of
      arr
    ) {

      const b =
        document.createElement(
          "button"
        );


      b.className =
        "obj" +
        (
          state.selectedId ===
          o.id
            ? " selected"
            : ""
        );


      const l =
        document.createElement(
          "span"
        );


      const r =
        document.createElement(
          "small"
        );


      l.textContent =
        objectName(
          o
        );


      r.textContent =
        o.kind ===
        "air"
          ? o.intensity
          : o.strength;


      b.append(
        l,
        r
      );


      b.onclick =
        () => {

          state.selectedId =
            o.id;


          updateObjects();

          render();

        };


      ui.objects.appendChild(
        b
      );

    }


    const sel =
      plan.objects.find(
        o =>
          o.id ===
          state.selectedId
      );


    ui.deleteSelected.disabled =
      !sel ||
      frozen(
        sel
      );

  }


  function deleteSelected() {

    const o =
      plan.objects.find(
        x =>
          x.id ===
          state.selectedId
      );


    if (!o) {

      return;

    }


    if (
      frozen(
        o
      )
    ) {

      msg(
        "That system begins in locked weather and cannot be deleted."
      );


      return;

    }


    plan.objects =
      plan.objects.filter(
        x =>
          x.id !==
          o.id
      );


    state.selectedId =
      null;


    saveSilent();

    updateObjects();

    updateInspect();

    render();


    msg(
      "Selected system deleted."
    );

  }


  /*
      =========================================================
      DONE AND LOCK
      =========================================================
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
        "DONE cannot move behind the locked boundary."
      );


      return;

    }


    plan.doneThrough =
      new Date(
        state.now
      ).toISOString();


    saveSilent();

    syncTimeline();


    msg(
      "Marked DONE through " +
      fmt(
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
        "Mark this time DONE before locking it."
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


    saveSilent();

    syncTimeline();

    updateObjects();


    msg(
      "Locked through " +
      fmt(
        state.now
      ) +
      "."
    );

  }


  /*
      =========================================================
      EXPORT
      =========================================================
  */


  function exportJSON() {

    const payload = {

      format:
        "EuropaCraftWeatherPlan",

      version:
        3,

      exportedAt:
        new Date()
          .toISOString(),

      bounds:
        B,

      precipitation:
        "calculated, never painted",

      geography:
        "Natural Earth 1:50m",

      terrain:
        "AWS Terrarium static elevation tiles",

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
      "Plan exported."
    );

  }


  /*
      =========================================================
      EVENTS
      =========================================================
  */


  function installEvents() {

    document
      .querySelectorAll(
        "[data-tool]"
      )
      .forEach(
        b =>
          b.addEventListener(
            "click",
            () =>
              setTool(
                b.dataset.tool
              )
          )
      );


    ui.finishAir.addEventListener(
      "click",
      finishAir
    );


    ui.cancelAir.addEventListener(
      "click",
      () =>
        cancelAir(
          true
        )
    );


    ui.layer.addEventListener(
      "change",
      () => {

        state.layer =
          ui.layer.value;


        render();

      }
    );


    ui.canvas.addEventListener(
      "click",
      mapClick
    );


    ui.canvas.addEventListener(
      "pointermove",
      pointerMove
    );


    ui.canvas.addEventListener(
      "pointerleave",
      () =>
        ui.coords.textContent =
          "—"
    );


    ui.canvas.addEventListener(
      "dblclick",
      e => {

        if (
          state.drawing &&
          state.draftPath.length >=
          2
        ) {

          e.preventDefault();

          finishAir();

        }

      }
    );


    ui.timeSlider.addEventListener(
      "input",
      () => {

        const a =
          Date.parse(
            plan.blockStart
          );


        const b =
          Date.parse(
            plan.blockEnd
          );


        setTime(

          a +

          (
            b -
            a
          ) *
          Number(
            ui.timeSlider.value
          ) /
          2000

        );

      }
    );


    ui.timeInput.addEventListener(
      "change",
      () => {

        const t =
          parseInput(
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

          syncTimeline();

        }

      }
    );


    ui.m6.onclick =
      () =>
        setTime(
          state.now -
          6 *
          HOUR
        );


    ui.m1.onclick =
      () =>
        setTime(
          state.now -
          HOUR
        );


    ui.p1.onclick =
      () =>
        setTime(
          state.now +
          HOUR
        );


    ui.p6.onclick =
      () =>
        setTime(
          state.now +
          6 *
          HOUR
        );


    ui.deleteSelected.onclick =
      deleteSelected;


    ui.markDone.onclick =
      markDone;


    ui.lockThrough.onclick =
      lockThrough;


    ui.save.onclick =
      () => {

        saveSilent();

        msg(
          "Plan saved locally."
        );

      };


    ui.export.onclick =
      exportJSON;


    ui.reset.onclick =
      () => {

        if (
          confirm(
            "Delete the local EuropaCraft weather plan?"
          )
        ) {

          localStorage.removeItem(
            STORAGE
          );


          plan =
            clone(
              defaults
            );


          state.now =
            Date.parse(
              plan.blockStart
            );


          state.selectedId =
            null;


          cancelAir(
            true
          );


          syncTimeline();

          updateObjects();

          updateInspect();

          render();


          msg(
            "Plan reset."
          );

        }

      };


    window.addEventListener(
      "resize",
      resize
    );


    window.addEventListener(
      "keydown",
      e => {

        if (
          e.key ===
          "Escape" &&
          state.drawing
        ) {

          cancelAir(
            true
          );

        }


        if (
          e.key ===
          "Enter" &&
          state.drawing
        ) {

          finishAir();

        }

      }
    );

  }


  /*
      =========================================================
      DATA STARTUP
      =========================================================
  */


  async function startData() {

    try {

      ui.mapHint.textContent =
        "Loading real European coastline…";


      msg(
        "Loading Natural Earth geography…"
      );


      const geo =
        await fetchJSON(
          GEO_URLS
        );


      buildLandMask(
        geo
      );


      buildBase();

      render();

      updateInspect();


      ui.mapHint.textContent =
        "Real coastline loaded. Loading elevation terrain…";


      msg(
        "Coastline ready. Loading AWS terrain tiles…"
      );


      const count =
        await loadTerrain();


      buildBase();

      render();

      updateInspect();


      if (
        state.terrainReady
      ) {

        ui.mapHint.textContent =
          "Ready. Draw air, place H/L, scrub time, inspect Temperature and Precipitation.";


        msg(
          "Ready. Real coastline and " +
          count +
          " terrain tiles loaded."
        );

      }
      else {

        ui.mapHint.textContent =
          "Coastline loaded, but terrain tiles could not load. Check browser/network access.";


        msg(
          "Terrain did not load. Weather still runs, but mountain effects are disabled."
        );

      }

    }
    catch (
      e
    ) {

      console.error(
        e
      );


      ui.mapHint.textContent =
        "REAL GEOGRAPHY FAILED TO LOAD — no fake fallback is being used.";


      msg(
        "Geography load failed: " +
        e.message
      );


      render();

    }

  }


  /*
      =========================================================
      START
      =========================================================
  */


  function init() {

    /*
        These happen BEFORE any network request.

        Therefore VIEWING and PLAN should appear immediately.
        If they do not, we know the JS itself has not loaded.
    */

    syncTimeline();

    installEvents();

    resize();

    updateObjects();


    ui.mapHint.textContent =
      "Starting engine…";


    msg(
      "Engine started. Loading real geography…"
    );


    startData();

  }


  init();

})();
