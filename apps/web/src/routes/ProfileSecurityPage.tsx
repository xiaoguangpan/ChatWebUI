import { ChevronRight, KeyRound } from 'lucide-react';
import { useState, type FC } from 'react';
import { apiPost } from '../api';
import { Modal } from '../components/Modal';
import { SubPageHeader } from '../components/SubPageHeader';

export const ProfileSecurityPage: FC = () => {
  const [pwOpen, setPwOpen] = useState(false);

  return (
    <>
      <SubPageHeader title="安全" back="/profile" />

      <div className="page">
        <div className="page__inner">
          <div className="list-group">
            <div className="list-group__title">登录与密码</div>
            <button type="button" className="list-item list-item--button" onClick={() => setPwOpen(true)}>
              <span className="list-item__icon">
                <KeyRound size={18} />
              </span>
              <span className="list-item__body">
                <span className="list-item__title">修改密码</span>
                <span className="list-item__desc">使用当前密码确认身份后更新</span>
              </span>
              <span className="list-item__chev">
                <ChevronRight size={18} />
              </span>
            </button>
          </div>
        </div>
      </div>

      <PasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </>
  );
};

const PasswordModal: FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const submit = async () => {
    setError('');
    setSaved(false);
    if (newPassword !== passwordConfirm) {
      setError('两次输入的密码不一致');
      return;
    }
    try {
      await apiPost('/api/me/password', {
        current_password: currentPassword,
        new_password: newPassword,
        password_confirm: passwordConfirm,
      });
      setCurrentPassword('');
      setNewPassword('');
      setPasswordConfirm('');
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改密码失败');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="修改密码"
      footer={
        <>
          <button type="button" className="c-btn c-btn--secondary" onClick={onClose}>
            关闭
          </button>
          <button type="button" className="c-btn c-btn--primary" onClick={submit}>
            保存
          </button>
        </>
      }
    >
      <div className="c-field" style={{ marginBottom: 12 }}>
        <label className="c-label">当前密码</label>
        <input className="c-input" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
      </div>
      <div className="c-field" style={{ marginBottom: 12 }}>
        <label className="c-label">新密码</label>
        <input className="c-input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
        <span className="c-help">至少 6 位</span>
      </div>
      <div className="c-field">
        <label className="c-label">确认新密码</label>
        <input className="c-input" type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} />
      </div>
      {error && <div className="c-help" style={{ color: 'var(--danger)', marginTop: 12 }}>{error}</div>}
      {saved && <div className="c-help" style={{ color: 'var(--success)', marginTop: 12 }}>密码已更新</div>}
    </Modal>
  );
};
