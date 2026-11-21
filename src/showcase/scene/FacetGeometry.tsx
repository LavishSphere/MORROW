import { useEffect, useMemo } from "react";
import * as THREE from "three";

type FacetGeometryProps =
  | { kind: "cone"; args: readonly [number, number, number] }
  | { kind: "cylinder"; args: readonly [number, number, number, number] }
  | { kind: "dodeca"; args: readonly [number, number] };

function createFlatGeometry(props: FacetGeometryProps) {
  const source =
    props.kind === "cone"
      ? new THREE.ConeGeometry(props.args[0], props.args[1], props.args[2])
      : props.kind === "cylinder"
        ? new THREE.CylinderGeometry(props.args[0], props.args[1], props.args[2], props.args[3])
        : new THREE.DodecahedronGeometry(props.args[0], props.args[1]);
  if (!source.index) {
    source.computeVertexNormals();
    return source;
  }
  const flat = source.toNonIndexed();
  source.dispose();
  flat.computeVertexNormals();
  return flat;
}

/** Hard face normals so cones and stones stay faceted without material.flatShading. */
export function FacetGeometry(props: FacetGeometryProps) {
  const key = `${props.kind}:${props.args.join(":")}`;
  const geometry = useMemo(() => createFlatGeometry(props), [key]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <primitive object={geometry} attach="geometry" />;
}
