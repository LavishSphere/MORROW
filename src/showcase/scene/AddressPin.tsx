import { Html } from "@react-three/drei";
import { useCitySelector } from "../cityStore";

const LOGO_BLUE = "#1488ff";

/** A pin over the address the resident jumped to, with its label. */
export function AddressPin() {
  const pin = useCitySelector((state) => state.pin);
  if (!pin) return null;
  return (
    <group position={[pin.x, 0, pin.z]} name="address-pin">
      <mesh position={[0, 1.1, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.03, 0.03, 2.2, 8]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 2.45, 0]} raycast={() => null}>
        <sphereGeometry args={[0.32, 20, 14]} />
        <meshStandardMaterial color={LOGO_BLUE} emissive={LOGO_BLUE} emissiveIntensity={0.7} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.09, 0]} raycast={() => null}>
        <ringGeometry args={[0.55, 0.75, 32]} />
        <meshBasicMaterial color={LOGO_BLUE} toneMapped={false} />
      </mesh>
      <Html position={[0, 3, 0]} center distanceFactor={10} zIndexRange={[4, 0]}>
        <div className="address-pin">{pin.label}</div>
      </Html>
    </group>
  );
}
