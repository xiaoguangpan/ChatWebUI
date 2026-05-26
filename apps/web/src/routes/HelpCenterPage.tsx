import { ChevronRight, MessageSquare, Search } from 'lucide-react';
import { useMemo, useState, type FC } from 'react';
import { SubPageHeader } from '../components/SubPageHeader';

type Faq = { q: string; a: string };

const SECTIONS: { title: string; faqs: Faq[] }[] = [
  {
    title: '入门',
    faqs: [
      {
        q: '如何开始一段新的对话?',
        a: '在左侧栏点击"新建对话",或者直接在底部输入框输入消息回车发送即可。每段对话都会自动保存到历史。',
      },
      {
        q: '如何切换模型?',
        a: '在输入框上方点击当前模型名,会弹出可用模型列表,所有 ✓ 标记的模型即可选择。',
      },
      {
        q: '如何生成图片?',
        a: '在左侧栏切到"生成图片",输入提示词后回车即可。图片尺寸按模型或上游默认执行,扣费按模型策略计算。',
      },
    ],
  },
  {
    title: '账号与积分',
    faqs: [
      {
        q: '积分怎么计算?',
        a: '对话按 token 计费,生图按张数计费。Plus 会员每月赠送 10000 积分,签到与活动也可获得。',
      },
      {
        q: '充值后积分多久到账?',
        a: '微信/支付宝渠道一般 1–5 秒到账,如超过 5 分钟未到账请联系客服。',
      },
      {
        q: 'Plus 会员有什么权益?',
        a: '更高的并发限额、专属模型、优先排队、每月赠送积分,详见会员中心。',
      },
    ],
  },
  {
    title: '安全与隐私',
    faqs: [
      {
        q: '我的对话数据会被用于训练吗?',
        a: '不会。ChatWebUI 不会将用户对话用于模型训练。详细政策见隐私协议。',
      },
      {
        q: '账号被盗如何处理?',
        a: '在"安全"中心立即修改密码并退出所有登录设备,如有损失可联系客服冻结账户。',
      },
    ],
  },
  {
    title: '常见问题',
    faqs: [
      {
        q: '生成中断了怎么办?',
        a: '点击发送按钮位置的"停止"图标即可中止当前生成。已经流出的文本不计费,中途扣费会按比例退还。',
      },
      {
        q: '导出对话?',
        a: '在对话页右上角的更多菜单中可以导出 Markdown 或 PDF。',
      },
    ],
  },
];

export const HelpCenterPage: FC = () => {
  const [keyword, setKeyword] = useState('');
  const k = keyword.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!k) return SECTIONS;
    return SECTIONS.map((s) => ({
      ...s,
      faqs: s.faqs.filter(
        (f) => f.q.toLowerCase().includes(k) || f.a.toLowerCase().includes(k),
      ),
    })).filter((s) => s.faqs.length > 0);
  }, [k]);

  return (
    <>
      <SubPageHeader
        title="帮助中心"
        back="/profile"
        right={
          <button
            type="button"
            className="c-btn c-btn--secondary c-btn--sm"
            aria-label="联系客服"
          >
            <MessageSquare size={14} />联系客服
          </button>
        }
      />

      <div className="page">
        <div className="page__inner">
          <div className="help-hero">
            <h2 className="help-hero__title">有什么可以帮你的?</h2>
            <div className="c-search help-hero__search">
              <span className="icon-search">
                <Search size={16} />
              </span>
              <input
                className="c-input"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索问题、关键词..."
              />
            </div>
          </div>

          {filtered.length === 0 && (
            <div className="u-text-center u-caption" style={{ padding: '32px 0' }}>
              没有找到相关问题,试试联系客服。
            </div>
          )}

          {filtered.map((s) => (
            <div className="list-group" key={s.title}>
              <div className="list-group__title">{s.title}</div>
              {s.faqs.map((f) => (
                <details className="faq-item" key={f.q}>
                  <summary className="faq-item__q">
                    <span>{f.q}</span>
                    <ChevronRight size={18} className="faq-item__chev" />
                  </summary>
                  <div className="faq-item__a">{f.a}</div>
                </details>
              ))}
            </div>
          ))}

          <div className="u-text-center u-caption" style={{ padding: '24px 0' }}>
            没有找到答案? 你也可以通过邮箱 <a href="mailto:support@chatwebui.app">support@chatwebui.app</a> 联系我们。
          </div>
        </div>
      </div>
    </>
  );
};
