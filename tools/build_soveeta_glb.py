#!/usr/bin/env python3
"""Procedural GLB builder — SOVEETA CATIN BEALALIM (COMBAT RIG).

Pure-python (no deps). Generates a stylized porcelain-armor figure
matching the master concept: cat-ear helmet rig, gloss-black under-suit,
pleated armor skirt, crimson thigh-highs, brass joints, sheathed katana.

Run:  python3 tools/build_soveeta_glb.py
Out:  assets/character/soveeta_3d.glb
"""
import json
import math
import struct
import os

OUT_PATH = os.path.join(os.path.dirname(__file__), '..', 'assets', 'character', 'soveeta_3d.glb')

# ---------------------------------------------------------------- materials
MATERIALS = [
    # name, baseColor(r,g,b,a), metallic, roughness, emissive, doubleSided
    ("Porcelain",      (0.94, 0.95, 0.97, 1.0), 0.15, 0.28, None, False),
    ("GlossBlack",     (0.055, 0.06, 0.07, 1.0), 0.92, 0.14, None, False),
    ("Crimson",        (0.62, 0.06, 0.16, 1.0), 0.30, 0.32, None, False),
    ("Brass",          (0.78, 0.62, 0.15, 1.0), 1.00, 0.24, None, False),
    ("Visor",          (0.015, 0.02, 0.03, 1.0), 1.00, 0.04, (0.02, 0.10, 0.16), False),
    ("SkirtFabric",    (0.07, 0.07, 0.085, 1.0), 0.10, 0.72, None, True),
]

PORC, GLBLK, CRIM, GOLD, VISOR, FABRIC = range(6)

# ---------------------------------------------------------------- vmath
def vadd(a, b): return (a[0]+b[0], a[1]+b[1], a[2]+b[2])
def vsub(a, b): return (a[0]-b[0], a[1]-b[1], a[2]-b[2])
def vscale(a, s): return (a[0]*s, a[1]*s, a[2]*s)
def vlen(a): return math.sqrt(a[0]*a[0] + a[1]*a[1] + a[2]*a[2])
def vnorm(a):
    l = vlen(a) or 1.0
    return (a[0]/l, a[1]/l, a[2]/l)

def mat_rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return [[1,0,0],[0,c,-s],[0,s,c]]
def mat_rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return [[c,0,s],[0,1,0],[-s,0,c]]
def mat_rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return [[c,-s,0],[s,c,0],[0,0,1]]
def mat_scale(sx, sy, sz):
    return [[sx,0,0],[0,sy,0],[0,0,sz]]
def mat_mul(A, B):
    return [[sum(A[i][k]*B[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
def mat_id(): return [[1,0,0],[0,1,0],[0,0,1]]
def mat_apply(M, v):
    return (M[0][0]*v[0]+M[0][1]*v[1]+M[0][2]*v[2],
            M[1][0]*v[0]+M[1][1]*v[1]+M[1][2]*v[2],
            M[2][0]*v[0]+M[2][1]*v[1]+M[2][2]*v[2])
def mat_inv_transpose(M):
    m = [[M[0][0],M[0][1],M[0][2]],[M[1][0],M[1][1],M[1][2]],[M[2][0],M[2][1],M[2][2]]]
    det = (m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])
         - m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])
         + m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]))
    if abs(det) < 1e-12: return mat_id()
    inv = [[0]*3 for _ in range(3)]
    inv[0][0] =  (m[1][1]*m[2][2]-m[1][2]*m[2][1])/det
    inv[0][1] = -(m[0][1]*m[2][2]-m[0][2]*m[2][1])/det
    inv[0][2] =  (m[0][1]*m[1][2]-m[0][2]*m[1][1])/det
    inv[1][0] = -(m[1][0]*m[2][2]-m[1][2]*m[2][0])/det
    inv[1][1] =  (m[0][0]*m[2][2]-m[0][2]*m[2][0])/det
    inv[1][2] = -(m[0][0]*m[1][2]-m[0][2]*m[1][0])/det
    inv[2][0] =  (m[1][0]*m[2][1]-m[1][1]*m[2][0])/det
    inv[2][1] = -(m[0][0]*m[2][1]-m[0][1]*m[2][0])/det
    inv[2][2] =  (m[0][0]*m[1][1]-m[0][1]*m[1][0])/det
    # transpose
    return [[inv[j][i] for j in range(3)] for i in range(3)]

# ---------------------------------------------------------------- geometry helpers
# each builder returns (positions:[(x,y,z)], normals:[(x,y,z)], indices:[i])
def ellipsoid(rx, ry, rz, u0=0.0, u1=2*math.pi, useg=36, vseg=18):
    P, N, I = [], [], []
    for v in range(vseg+1):
        phi = math.pi * v / vseg
        sp, cp = math.sin(phi), math.cos(phi)
        for u in range(useg+1):
            th = u0 + (u1-u0) * u / useg
            st, ct = math.sin(th), math.cos(th)
            p = (rx*sp*ct, ry*cp, rz*sp*st)
            P.append(p)
            N.append(vnorm((p[0]/rx/rx, p[1]/ry/ry, p[2]/rz/rz)))
    for v in range(vseg):
        for u in range(useg):
            a = v*(useg+1)+u; b = a+1
            c = a+useg+1; d = c+1
            I += [a, c, b, b, c, d]
    return P, N, I

def lathe(profile, segs=48, radial_wave=None, u0=0.0, u1=2*math.pi):
    """profile: [(r, y)] bottom->top. radial_wave(amp, freq) pleats the radius."""
    amp, freq = radial_wave if radial_wave else (0.0, 0)
    P, N, I = [], [], []
    # per-profile-point normals (2D outward, from polyline gradient)
    n2d = []
    for i in range(len(profile)):
        i0 = max(0, i-1); i1 = min(len(profile)-1, i+1)
        dr = profile[i1][0]-profile[i0][0]
        dy = profile[i1][1]-profile[i0][1]
        # tangent (dr, dy) -> outward normal (-dy, dr), y-component positive = outward
        n2d.append(vnorm2((-dy, dr)))
    for u in range(segs+1):
        th = u0 + (u1-u0) * u / segs
        st, ct = math.sin(th), math.cos(th)
        for i, (r, y) in enumerate(profile):
            rr = r + amp * math.sin(freq*th)
            P.append((rr*ct, y, rr*st))
            nn = n2d[i]
            N.append(vnorm((nn[0]*ct, nn[1], nn[0]*st)))
    np_ = len(profile)
    for u in range(segs):
        for i in range(np_-1):
            a = u*np_+i; b = a+1
            c = a+np_; d = c+1
            I += [a, b, c, b, d, c]
    return P, N, I

def vnorm2(a):
    l = math.sqrt(a[0]*a[0]+a[1]*a[1]) or 1.0
    return (a[0]/l, a[1]/l)

def capsule(r, cyl_len, segs=24, arc_segs=6):
    """Capsule along Y, centered at origin. Total height = cyl_len + 2r."""
    prof = []
    hl = cyl_len/2.0
    # bottom arc
    for i in range(arc_segs+1):
        a = -math.pi/2 + (math.pi/2)*i/arc_segs
        prof.append((r*math.cos(a), -hl + r*math.sin(a)))
    # top arc
    for i in range(arc_segs+1):
        a = (math.pi/2)*i/arc_segs
        prof.append((r*math.cos(a), hl + r*math.sin(a)))
    return lathe(prof, segs)

def cylinder(r_bot, r_top, h, segs=24):
    hl = h/2.0
    return lathe([(r_bot, -hl), (r_top, hl)], segs)

def torus(R, r, segs_maj=40, segs_min=10):
    P, N, I = [], [], []
    for j in range(segs_maj+1):
        th = 2*math.pi*j/segs_maj
        ct, st = math.cos(th), math.sin(th)
        for i in range(segs_min+1):
            ph = 2*math.pi*i/segs_min
            cp, sp = math.cos(ph), math.sin(ph)
            rr = R + r*cp
            P.append((rr*ct, r*sp, rr*st))
            N.append((cp*ct, sp, cp*st))
    for j in range(segs_maj):
        for i in range(segs_min):
            a = j*(segs_min+1)+i; b = a+1
            c = a+segs_min+1; d = c+1
            I += [a, b, c, b, d, c]
    return P, N, I

def cone(r_base, h, segs=24):
    hl = h/2.0
    prof = [(r_base, -hl), (0.0005, hl)]
    return lathe(prof, segs)

# ---------------------------------------------------------------- transforms
def xform(geom, M=None, t=(0,0,0)):
    P, N, I = geom
    if M is None: M = mat_id()
    MiT = mat_inv_transpose(M)
    P2 = [vadd(mat_apply(M, p), t) for p in P]
    N2 = [vnorm(mat_apply(MiT, n)) for n in N]
    return P2, N2, I

PARTS = []  # (name, geometry, material_index)
def add(name, geom, mat, M=None, t=(0,0,0)):
    PARTS.append((name, xform(geom, M, t), mat))

def scale3(sx, sy, sz): return mat_scale(sx, sy, sz)

# ---------------------------------------------------------------- build the figure
def build():
    # ---- HEAD / CAT-EAR HELMET RIG
    add("helmet", ellipsoid(0.096, 0.108, 0.102), PORC, t=(0, 1.483, 0))
    # face visor (front shell)
    add("visor", ellipsoid(0.088, 0.098, 0.096, u0=math.pi/2-1.15, u1=math.pi/2+1.15), VISOR,
        t=(0, 1.483, 0.012))
    # visor trim ring (thin gold frame around the face opening)
    add("visor_trim", torus(0.085, 0.006, 40, 8), GOLD,
        M=mat_mul(mat_rot_x(math.radians(90)), scale3(1.0, 1.08, 1.0)), t=(0, 1.485, 0.030))
    # cat ears (flattened cones tilted outward)
    for sx in (-1, 1):
        add("ear_%s" % ("L" if sx < 0 else "R"), cone(0.038, 0.085, 20), PORC,
            M=mat_mul(mat_rot_z(math.radians(-22*sx)), scale3(1.0, 1.0, 0.42)),
            t=(0.058*sx, 1.585, -0.005))
        add("ear_tip_%s" % sx, ellipsoid(0.008, 0.008, 0.008), GLBLK,
            t=(0.075*sx, 1.622, -0.005))
    # helmet rear antenna / ponytail mount
    add("hair_tie", torus(0.026, 0.008, 24, 8), PORC,
        M=mat_rot_x(math.radians(78)), t=(0, 1.548, -0.086))
    # ponytail chain (gloss black, arcing down the back)
    chain = [(0.0, 1.560, -0.092, 0.034), (0.004, 1.520, -0.118, 0.030),
             (0.008, 1.470, -0.140, 0.027), (0.010, 1.415, -0.152, 0.024),
             (0.008, 1.360, -0.156, 0.020), (0.002, 1.305, -0.150, 0.016),
             (-0.004, 1.255, -0.138, 0.012), (-0.008, 1.210, -0.122, 0.008)]
    for i, (x, y, z, r) in enumerate(chain):
        add("ponytail_%d" % i, ellipsoid(r, r*1.5, r), GLBLK, t=(x, y, z))

    # ---- NECK (black mechanics + brass collar)
    add("neck", cylinder(0.036, 0.034, 0.075, 18), GLBLK, t=(0, 1.392, 0))
    add("neck_ring", torus(0.040, 0.007, 28, 8), GOLD, t=(0, 1.415, 0))

    # ---- TORSO
    add("chest_plate", ellipsoid(0.118, 0.092, 0.088), PORC, t=(0, 1.300, 0.012))
    add("bust_suit", ellipsoid(0.104, 0.072, 0.078), GLBLK, t=(0, 1.238, 0.020))
    add("abdomen", ellipsoid(0.098, 0.080, 0.068), GLBLK, t=(0, 1.120, 0.004))
    add("waist_ring", torus(0.101, 0.008, 36, 8), GOLD, t=(0, 1.158, 0))
    add("back_plate", ellipsoid(0.110, 0.088, 0.06), PORC, t=(0, 1.295, -0.045))

    # ---- HIPS + PLEATED SKIRT
    add("hips", ellipsoid(0.108, 0.078, 0.082), GLBLK, t=(0, 1.000, 0))
    skirt_prof = [(0.118, 1.045), (0.130, 1.010), (0.152, 0.968), (0.176, 0.924),
                  (0.196, 0.885), (0.208, 0.856), (0.212, 0.838)]
    add("skirt", lathe(skirt_prof, 56, radial_wave=(0.012, 16)), FABRIC)
    hem = [(0.212, 0.845), (0.216, 0.834)]
    add("skirt_hem", lathe(hem, 56, radial_wave=(0.012, 16)), PORC)

    # ---- LEGS (crimson thigh-highs + porcelain greaves + heel boots)
    for sx in (-1, 1):
        x = 0.066*sx
        add("thigh_%s" % sx, capsule(0.071, 0.26, 26), CRIM, t=(x, 0.800, 0))
        add("thigh_ring_%s" % sx, torus(0.075, 0.0085, 30, 8), GOLD,
            M=mat_scale(1.0, 1.0, 1.0), t=(x, 0.875, 0))
        add("knee_%s" % sx, ellipsoid(0.052, 0.058, 0.030), PORC, t=(x, 0.505, 0.040))
        add("shin_%s" % sx, lathe([(0.058, -0.185), (0.048, 0.0), (0.042, 0.19)], 26),
            PORC, t=(x, 0.315, 0))
        add("ankle_ring_%s" % sx, torus(0.046, 0.007, 26, 8), GOLD, t=(x, 0.135, 0))
        # heel boot: foot + stiletto + sole
        add("boot_%s" % sx, ellipsoid(0.052, 0.045, 0.105), PORC, t=(x, 0.075, 0.035))
        add("boot_sole_%s" % sx, ellipsoid(0.046, 0.02, 0.10), GLBLK, t=(x, 0.035, 0.04))
        add("stiletto_%s" % sx, cylinder(0.006, 0.011, 0.100, 12), GOLD, t=(x, 0.050, -0.052))

    # ---- ARMS (porcelain plating, gloss sleeves, gauntlets)
    tilt = math.radians(6)
    for sx in (-1, 1):
        rot = mat_rot_z(tilt*sx)
        add("shoulder_%s" % sx, ellipsoid(0.055, 0.048, 0.048), PORC, t=(0.142*sx, 1.342, 0))
        add("upper_arm_%s" % sx, capsule(0.033, 0.115, 20), PORC, M=rot,
            t=(0.160*sx, 1.252, 0))
        add("elbow_ring_%s" % sx, torus(0.036, 0.0065, 22, 8), GOLD,
            M=mat_mul(rot, mat_rot_x(math.radians(90))), t=(0.170*sx, 1.178, 0))
        add("forearm_%s" % sx, capsule(0.030, 0.105, 20), GLBLK, M=rot,
            t=(0.178*sx, 1.090, 0))
        add("gauntlet_%s" % sx, cylinder(0.033, 0.044, 0.070, 20), PORC, M=rot,
            t=(0.182*sx, 1.055, 0))
        add("fist_%s" % sx, ellipsoid(0.038, 0.046, 0.042), GLBLK, M=rot,
            t=(0.190*sx, 0.968, 0.004))

    # ---- KATANA riding her hip (saya slant across, guard + handle forward-left)
    yaw = mat_rot_y(math.radians(-8))
    roll = mat_rot_z(math.radians(92))   # lay the Y-axis cylinders along X
    kt_y, kt_z = 1.020, 0.118
    add("saya", cylinder(0.015, 0.013, 0.70, 14), VISOR,
        M=mat_mul(yaw, roll), t=(-0.140, kt_y, kt_z))
    add("saya_tip", cone(0.013, 0.045, 12), GOLD,
        M=mat_mul(yaw, mat_mul(mat_rot_z(math.radians(180)), mat_rot_x(0))),
        t=(-0.490+0.0175, kt_y, kt_z-0.058))
    add("tsuba", cylinder(0.037, 0.037, 0.012, 20), GOLD, M=mat_mul(yaw, roll),
        t=(0.208, kt_y, kt_z+0.032))
    add("tsuka", cylinder(0.017, 0.017, 0.215, 14), GLBLK, M=mat_mul(yaw, roll),
        t=(0.316, kt_y, kt_z+0.050))
    add("kashira", ellipsoid(0.020, 0.020, 0.020), GOLD, t=(0.428, kt_y, kt_z+0.067))
    # sageo braid wrap (crimson rings along the handle)
    for i in range(3):
        add("tsuka_wrap_%d" % i, torus(0.019, 0.004, 16, 6), CRIM,
            M=mat_mul(yaw, mat_rot_x(math.radians(90))),
            t=(0.262 + i*0.055, kt_y, kt_z+0.040+i*0.009))

    return PARTS

# ---------------------------------------------------------------- GLB writer
FLOAT, USHORT = 5126, 5123
VEC3, SCALAR = "VEC3", "SCALAR"

def write_glb(parts, mats, path):
    buffer_views, accessors, meshes, nodes, materials = [], [], [], [], []
    bin_buf = bytearray()

    def add_view(data, target):
        # 4-byte align
        while len(bin_buf) % 4 != 0:
            bin_buf.append(0)
        off = len(bin_buf)
        bin_buf.extend(data)
        buffer_views.append({"buffer": 0, "byteOffset": off,
                             "byteLength": len(data), "target": target})
        return len(buffer_views)-1

    def add_floats(triples, target):
        flat = [c for v in triples for c in v]
        bv = add_view(struct.pack("<%df" % len(flat), *flat), target)
        return bv

    def add_accessor(bv, ctype, count, atype, mn=None, mx=None):
        acc = {"bufferView": bv, "componentType": ctype, "count": count, "type": atype}
        if mn is not None: acc["min"] = mn
        if mx is not None: acc["max"] = mx
        accessors.append(acc)
        return len(accessors)-1

    for name, (P, N, I), mi in parts:
        pa = add_accessor(add_floats(P, 34962), FLOAT, len(P), VEC3,
                          mn=[min(p[k] for p in P) for k in range(3)],
                          mx=[max(p[k] for p in P) for k in range(3)])
        na = add_accessor(add_floats(N, 34962), FLOAT, len(N), VEC3)
        # pad index buffer to 2-byte alignment handled by add_view's 4-byte align
        ibv = add_view(struct.pack("<%dH" % len(I), *I), 34963)
        ia = add_accessor(ibv, USHORT, len(I), SCALAR)
        meshes.append({"name": name, "primitives": [{
            "attributes": {"POSITION": pa, "NORMAL": na},
            "indices": ia, "material": mi}]})
        nodes.append({"name": name, "mesh": len(meshes)-1})

    for name, rgba, metal, rough, emis, dbl in mats:
        m = {"name": name,
             "pbrMetallicRoughness": {"baseColorFactor": list(rgba),
                                      "metallicFactor": metal,
                                      "roughnessFactor": rough}}
        if emis: m["emissiveFactor"] = list(emis)
        if dbl: m["doubleSided"] = True
        materials.append(m)

    gltf = {"asset": {"version": "2.0", "generator": "soveeta-glb-builder/1.0"},
            "scene": 0,
            "scenes": [{"nodes": list(range(len(nodes))), "name": "SOVEETA"}],
            "nodes": nodes, "meshes": meshes,
            "materials": materials, "accessors": accessors,
            "bufferViews": buffer_views,
            "buffers": [{"byteLength": len(bin_buf)}]}

    js = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    while len(js) % 4 != 0: js += b" "
    while len(bin_buf) % 4 != 0: bin_buf.append(0)

    total = 12 + 8 + len(js) + 8 + len(bin_buf)
    out = struct.pack("<4sII", b"glTF", 2, total)
    out += struct.pack("<I4s", len(js), b"JSON") + js
    out += struct.pack("<I4s", len(bin_buf), b"BIN\x00") + bytes(bin_buf)

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(out)

    # ---- sanity re-parse
    assert out[:4] == b"glTF"
    jlen = struct.unpack("<I", out[12:16])[0]
    parsed = json.loads(out[20:20+jlen])
    npos = sum(a["count"] for a in parsed["accessors"] if a["type"] == "VEC3")
    print(f"GLB ok: {len(parts)} parts, {parsed['buffers'][0]['byteLength']} byte BIN, "
          f"{npos} vec3s, file {total} bytes -> {path}")
    # bounds
    mn = [min(a["min"][k] for a in parsed["accessors"] if a.get("min")) for k in range(3)]
    mx = [max(a["max"][k] for a in parsed["accessors"] if a.get("max")) for k in range(3)]
    print("bounds min", [round(v,3) for v in mn], "max", [round(v,3) for v in mx])

if __name__ == "__main__":
    write_glb(build(), MATERIALS, OUT_PATH)
