import { css } from 'jimu-core'

export const rootCss = css`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  color: #eceff4;
  background: #17191f;

  .ue-widget {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .ue-tb {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: #17191f;
    flex-wrap: wrap;
    flex: 0 0 auto;
  }

  .ue-tb-info {
    font-size: 14px;
    font-weight: 600;
    color: #f0f2f6;
    margin-right: 2px;
    line-height: 1;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    min-height: 30px;
  }

  .ue-tb-btn {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: #23262d;
    color: #f0f2f6;
    border-radius: 6px;
    padding: 0 10px;
    height: 30px;
    min-height: 30px;
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    cursor: pointer;
    transition: background 120ms ease, border-color 120ms ease, transform 80ms ease;
    box-shadow: none;
    vertical-align: middle;
    white-space: nowrap;
  }

  .ue-tb-btn:hover:not(:disabled) {
    background: #2b2f38;
    border-color: rgba(255, 255, 255, 0.18);
  }

  .ue-tb-btn:active:not(:disabled) {
    transform: translateY(1px);
  }

  .ue-tb-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .ue-tb-btn--active {
    background: #30343d;
    border-color: rgba(255, 255, 255, 0.22);
    color: #ffffff;
  }

  .ue-tb-checkbtn {
    gap: 7px;
    user-select: none;
    padding-left: 9px;
    padding-right: 10px;
  }

  .ue-tb-checkbtn input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .ue-tb-checkbtn__box {
    width: 14px;
    height: 14px;
    flex: 0 0 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.24);
    background: #181b21;
    color: transparent;
    font-size: 11px;
    line-height: 1;
    box-sizing: border-box;
  }

  .ue-tb-checkbtn--active .ue-tb-checkbtn__box {
    background: #4da3ff;
    border-color: #4da3ff;
    color: #ffffff;
  }

  .ue-tb-checkbtn__text {
    display: inline-flex;
    align-items: center;
    line-height: 1;
    white-space: nowrap;
  }

  .ue-panel {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    background: #181b21;
    position: relative;
    display: flex;
    flex-direction: column;
  }

  .ue-form-host {
    padding: 10px;
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .ue-form-header {
    flex: 0 0 auto;
    position: relative;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    margin: 0 0 8px 0;
    padding: 0 0 8px 0;
    background: transparent;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    min-height: 0;
    height: auto;
  }

  .ue-form-title {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 16px;
    font-weight: 650;
    line-height: 1.2;
    color: #f2f4f8;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .ue-form-title--sm {
    font-size: 14px;
    font-weight: 600;
  }

  .ue-form-actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .ue-form-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }

  .ue-btn {
    appearance: none;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: #23262d;
    color: #f0f2f6;
    border-radius: 6px;
    padding: 4px 10px;
    min-height: 30px;
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    cursor: pointer;
    transition: background 120ms ease, border-color 120ms ease, transform 80ms ease;
  }

  .ue-btn--sm {
    padding: 3px 9px;
    min-height: 26px;
    font-size: 12px;
  }

  /* Иконки для undo/redo: более толстые и контрастные стрелки */
  .ue-btn--icon {
    padding-left: 6px;
    padding-right: 6px;
    min-width: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .ue-btn--icon svg.ue-icon-undo,
  .ue-btn--icon svg.ue-icon-redo {
    width: 18px;
    height: 18px;
    display: block;
  }

  .ue-btn--icon svg.ue-icon-undo path,
  .ue-btn--icon svg.ue-icon-undo polyline,
  .ue-btn--icon svg.ue-icon-undo line,
  .ue-btn--icon svg.ue-icon-redo path,
  .ue-btn--icon svg.ue-icon-redo polyline,
  .ue-btn--icon svg.ue-icon-redo line {
    stroke: #ffffff;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  /* конец фикса иконок */

  .ue-btn:hover:not(:disabled) {
    background: #2b2f38;
    border-color: rgba(255, 255, 255, 0.18);
  }

  .ue-btn:active:not(:disabled) {
    transform: translateY(1px);
  }

  .ue-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .ue-btn--secondary {
    background: #23262d;
  }

  .ue-btn--danger {
    background: #2b2124;
    border-color: rgba(220, 90, 90, 0.42);
    color: #f08a8a;
  }

  .ue-btn--danger:hover:not(:disabled) {
    background: #33262a;
    border-color: rgba(220, 90, 90, 0.56);
  }

  .ue-form-hint,
  .ue-hint {
    margin: 0 0 10px;
    color: #b7bec9;
    font-size: 11px !important;
    line-height: 1.4;
  }

  .ue-form-delete-row {
    margin: 0 0 8px 0;
    padding: 6px 0 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }

  .ue-form-delete-text {
    font-size: 12px;
    color: #e0aeb0;
  }

  .ue-form-delete-actions {
    display: flex;
    gap: 6px;
  }

  .ue-idle-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 8px 0 0;
    overflow: hidden;
    min-height: 0;
  }

  .ue-idle-hint {
    flex: 0 0 auto;
    padding: 0 10px 5px;
    margin: 0;
    color: #b7bec9;
    font-size: 11px !important;
    font-weight: 500 !important;
    line-height: 1.35;
  }

  .ue-template-grid {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding: 8px 10px 12px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    align-content: start;
  }

  .ue-template-tile {
    appearance: none;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: #1b1e25;
    color: #eef1f5;
    border-radius: 8px;
    min-height: 96px;
    padding: 10px 8px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 9px;
    transition: background 120ms ease, border-color 120ms ease, transform 80ms ease;
  }

  .ue-template-tile:hover {
    background: #222631;
    border-color: rgba(255, 255, 255, 0.16);
  }

  .ue-template-tile:active {
    transform: translateY(1px);
  }

  .ue-template-tile__symbol {
    width: 38px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex: 0 0 auto;
  }

  .ue-template-svg {
    width: 34px;
    height: 24px;
    display: block;
  }

  .ue-template-tile__label {
    font-size: 12px;
    line-height: 1.25;
    text-align: center;
    color: #eef1f5;
    word-break: break-word;
  }

  .ue-merge-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 4px;
  }

  .ue-merge-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    background: #1b1e25;
    cursor: pointer;
  }

  .ue-merge-item:hover {
    background: #20242d;
    border-color: rgba(255, 255, 255, 0.14);
  }

  .ue-merge-item--active {
    background: #262a32;
    border-color: rgba(255, 255, 255, 0.2);
  }

  .ue-merge-item input[type='radio'] {
    margin: 0;
  }

  .ue-merge-item__text {
    color: #eef1f5;
    font-size: 13px;
  }

  .ue-merge-item__oid {
    color: #9da6b3;
    margin-left: 6px;
  }

  .ue-form-host .esri-widget,
  .ue-form-host .esri-feature-form {
    background: transparent;
    color: #eef1f5;
    box-shadow: none;
  }

  .ue-form-host .esri-feature-form {
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    background: #1b1e25;
    overflow: hidden;
    min-height: 0;
  }

  .ue-form-host .esri-feature-form__group,
  .ue-form-host .esri-feature-form__section,
  .ue-form-host .esri-feature-form__field {
    background: transparent;
  }

  .ue-form-host .esri-input,
  .ue-form-host .esri-select,
  .ue-form-host input,
  .ue-form-host textarea,
  .ue-form-host select {
    background: #15181e !important;
    color: #edf1f6 !important;
    border-color: rgba(255, 255, 255, 0.1) !important;
    border-radius: 4px !important;
    font-size: 13px !important;
  }

  .ue-form-host .esri-input:focus,
  .ue-form-host .esri-select:focus,
  .ue-form-host input:focus,
  .ue-form-host textarea:focus,
  .ue-form-host select:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.22) !important;
    box-shadow: none !important;
  }

  .ue-form-host .esri-feature-form label,
  .ue-form-host .esri-feature-form__label {
    color: #ced4de !important;
    font-size: 12px !important;
  }

  .ue-form-host .esri-feature-form__description,
  .ue-form-host .esri-text-help {
    color: #9da6b3 !important;
  }

  .ue-form-host .esri-feature-form__input--disabled,
  .ue-form-host input[disabled],
  .ue-form-host textarea[disabled],
  .ue-form-host select[disabled] {
    opacity: 0.72;
  }

  .ue-geom-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    padding: 0 2px 0 2px;
    color: #eef1f5;
    font-size: 13px;
    user-select: none;
    cursor: pointer;
  }

  .ue-geom-toggle input[type='checkbox'] {
    margin: 0;
    width: 14px;
    height: 14px;
    accent-color: #4da3ff;
    cursor: pointer;
  }

  .ue-geom-toggle span {
    line-height: 1;
    white-space: nowrap;
  }
`

export default rootCss
