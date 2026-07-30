import AlertaAmbar from './AlertaAmbar';

/**
 * Aviso de que um IP de LAN não é alcançável em rede móvel.
 *
 * Componente condicional: renderiza `null` quando `visible` é falso.
 * Hoje a home passa `visible` fixo; a intenção é ligar essa prop à detecção
 * real de tipo de rede (NetInfo → `isCellular`) sem alterar este componente.
 *
 * O visual vem de `AlertaAmbar`, compartilhado com os demais avisos do app.
 *
 * @param {object} props
 * @param {boolean} [props.visible=true] — exibe o alerta (futuro: `isCellular`)
 */
export default function NetworkWarning({ visible = true }) {
  return (
    <AlertaAmbar
      visible={visible}
      destaque="Em dados móveis (4G/5G)"
      texto="este IP não é alcançável. Conecte-se ao Wi‑Fi da igreja."
    />
  );
}
